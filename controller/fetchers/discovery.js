const DEFAULT_PORT = 3000;
const DEFAULT_CONCURRENCY = 800;
const DEFAULT_TIMEOUT = 2500;
const DEFAULT_PATH = "/";

export function isValidIpv4(ip) {
  if (typeof ip !== "string") return false;

  const octets = ip.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => {
      const value = Number(octet);
      return /^\d+$/.test(octet) && value >= 0 && value <= 255;
    })
  );
}

function ipToNumber(ip) {
  return ip
    .split(".")
    .reduce((number, octet) => number * 256 + Number(octet), 0);
}

function numberToIp(number) {
  return [24, 16, 8, 0]
    .map((shift) => Math.floor(number / 2 ** shift) % 256)
    .join(".");
}

function parseCidr(cidr) {
  const [base, bitsText = "32"] = cidr.split("/");
  const prefixLength = Number(bitsText);

  if (
    !isValidIpv4(base) ||
    !Number.isInteger(prefixLength) ||
    prefixLength < 0 ||
    prefixLength > 32
  ) {
    throw new Error("CIDR inválido.");
  }

  const size = 2 ** (32 - prefixLength);
  const start = Math.floor(ipToNumber(base) / size) * size;
  return { start, end: start + size - 1 };
}

/** Retorna somente as sub-redes fornecidas pelo Vite. */
export function getLocalNetworkCidrs() {
  const cidrs = import.meta.env.LOCAL_NETWORK_CIDRS;
  return Array.isArray(cidrs) ? cidrs : [];
}

function* generateIps(range) {
  for (let number = range.start; number <= range.end; number += 1) {
    yield numberToIp(number);
  }
}

async function getIdentity(apiUrl, timeout, path, signal) {
  try {
    if (apiUrl.includes("192.168.18.46"))
      console.log(`Tentando fetch em ${apiUrl}`);
    const response = await fetch(`${apiUrl}${path}`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
      redirect: "manual",
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return null;
    }
    const identity = await response.json();
    if (
      !identity ||
      typeof identity.nome !== "string" ||
      typeof identity.id !== "string" ||
      !isValidIpv4(identity.ip)
    ) {
      return null;
    }
    return identity;
  } catch {
    return null;
  }
}

async function saveIdentity(identity, timeout, signal) {
  // O navegador entrega os dados à API local; somente Peer escreve no CSV.
  const response = await fetch(`${import.meta.env.LOCAL_API_URL}/peer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(identity),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
  });
  if (response.status !== 204) {
    await response.body?.cancel();
    throw new Error(
      "Peer encontrado, mas não foi possível salvar em peers.csv.",
    );
  }
}

/**
 * Procura identidades por GET em `path` (padrão "/") nas sub-redes locais
 * na ordem recebida de Network e as salva na API local.
 * Sem sub-redes, retorna uma lista vazia.
 * @param {AbortSignal} [options.signal] Interrompe requisições e retorna os Peers já salvos.
 * @param {object} [options]
 * @param {number} [options.port=3000]
 * @param {number} [options.concurrency=500]
 * @param {number} [options.timeout=1500]
 * @param {string} [options.path="/"] Caminho usado para verificar a API.
 * @param {(peer: object) => void | Promise<void>} [options.onFound]
 *   Chamado após salvar cada identidade. Erros de gravação interrompem a busca.
 * @returns {Promise<object[]>}
 */
export async function discoverPeers(options = {}) {
  const {
    port = DEFAULT_PORT,
    concurrency = DEFAULT_CONCURRENCY,
    timeout = DEFAULT_TIMEOUT,
    path = DEFAULT_PATH,
    onFound,
    signal,
  } = options;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Informe uma porta válida.");
  }
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("Informe uma concorrência positiva.");
  }
  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new Error("Informe um timeout positivo.");
  }
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("Informe um caminho válido.");
  }

  const ranges = getLocalNetworkCidrs().map((item) => parseCidr(item.trim()));
  const discoveredPeers = new Map();
  let stopped = false;

  // Conclui cada CIDR na ordem de Network, mantendo o paralelismo dentro da faixa.
  for (const range of ranges) {
    if (signal?.aborted) break;
    const iterator = generateIps(range);
    const testNext = async () => {
      while (!stopped && !signal?.aborted) {
        const { value: address, done } = iterator.next();
        if (done) return;

        const apiUrl = `http://${address}:${port}`;
        const identity = await getIdentity(apiUrl, timeout, path, signal);
        if (!identity || stopped || signal?.aborted) continue;
        if (discoveredPeers.has(identity.id)) continue; // faixas sobrepostas ou várias interfaces

        discoveredPeers.set(identity.id, identity);
        try {
          await saveIdentity(identity, timeout, signal);
          await onFound?.(identity);
        } catch (error) {
          if (signal?.aborted) {
            discoveredPeers.delete(identity.id);
            return;
          }
          stopped = true; // evita que os outros workers continuem em segundo plano
          throw error;
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, range.end - range.start + 1) },
        testNext,
      ),
    );
  }

  return [...discoveredPeers.values()];
}

export default discoverPeers;
