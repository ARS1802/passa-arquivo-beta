const DEFAULT_PORT = 3000;
const DEFAULT_CONCURRENCY = 500;
const DEFAULT_TIMEOUT = 1500;
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

function* generateIps(ranges) {
  for (const range of ranges) {
    for (let number = range.start; number <= range.end; number += 1) {
      yield numberToIp(number);
    }
  }
}

async function getIdentity(apiUrl, timeout, path) {
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      signal: AbortSignal.timeout(timeout),
      redirect: "manual",
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return null;
    }
    const identity = await response.json();
    if (!identity || typeof identity.nome !== "string" ||
        typeof identity.id !== "string" || !isValidIpv4(identity.ip)) {
      return null;
    }
    return identity;
  } catch {
    return null;
  }
}

async function saveIdentity(identity, timeout) {
  // O navegador entrega os dados à API local; somente Peer escreve no CSV.
  const response = await fetch(`${import.meta.env.LOCAL_API_URL}/peer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(identity),
    signal: AbortSignal.timeout(timeout),
  });
  if (response.status !== 204) {
    await response.body?.cancel();
    throw new Error("Peer encontrado, mas não foi possível salvar em peers.csv.");
  }
}

/**
 * Procura identidades por GET em `path` (padrão "/") nas sub-redes locais
 * e as salva na API local. Sem sub-redes, retorna uma lista vazia.
 * @param {object} [options]
 * @param {number} [options.port=3000]
 * @param {number} [options.concurrency=500]
 * @param {number} [options.timeout=1500]
 * @param {string} [options.path="/"] Caminho usado para verificar a API.
 * @param {(url: string) => void | Promise<void>} [options.onFound]
 *   Chamado após salvar cada identidade. Erros de gravação interrompem a busca.
 * @returns {Promise<string[]>}
 */
export async function discoverApis(options = {}) {
  const {
    port = DEFAULT_PORT,
    concurrency = DEFAULT_CONCURRENCY,
    timeout = DEFAULT_TIMEOUT,
    path = DEFAULT_PATH,
    onFound,
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
  const totalAddresses = ranges.reduce(
    (total, { start, end }) => total + end - start + 1,
    0,
  );

  const iterator = generateIps(ranges);
  const discoveredApis = new Set();
  let stopped = false;

  const testNext = async () => {
    while (!stopped) {
      const { value: address, done } = iterator.next();
      if (done) return;

      const apiUrl = `http://${address}:${port}`;
      const identity = await getIdentity(apiUrl, timeout, path);
      if (!identity || stopped) continue;
      if (discoveredApis.has(apiUrl)) continue; // faixas sobrepostas

      discoveredApis.add(apiUrl);
      try {
        await saveIdentity(identity, timeout);
        await onFound?.(apiUrl);
      } catch (error) {
        stopped = true; // evita que os outros workers continuem em segundo plano
        throw error;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, totalAddresses) }, testNext),
  );

  return [...discoveredApis];
}

export default discoverApis;
