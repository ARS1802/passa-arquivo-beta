const DEFAULT_PORT = 3000;
const DEFAULT_CONCURRENCY = 500;
const DEFAULT_TIMEOUT = 1500;
const DEFAULT_PATH = "/";
const SKIP_RESERVED = true;
const LOCAL_DETECTION_TIMEOUT = 1000;

// Sub-redes comuns de roteadores domésticos e corporativos. Usadas apenas
// quando o navegador não revela em qual sub-rede o dispositivo está.
const COMMON_LOCAL_CIDRS = [
  "192.168.0.0/24",
  "192.168.1.0/24",
  "192.168.2.0/24",
  "192.168.15.0/24",
  "192.168.18.0/24",
  "192.168.100.0/24",
  "10.0.0.0/24",
  "10.0.1.0/24",
  "10.1.1.0/24",
  "172.16.0.0/24",
];

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

const RESERVED_RANGES = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "224.0.0.0/4",
  "240.0.0.0/4",
].map(parseCidr);

const PRIVATE_RANGES = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"].map(
  parseCidr,
);

function isReserved(number) {
  return RESERVED_RANGES.some(
    ({ start, end }) => number >= start && number <= end,
  );
}

function isPrivateIpv4(ip) {
  if (!isValidIpv4(ip)) return false;

  const number = ipToNumber(ip);
  return PRIVATE_RANGES.some(
    ({ start, end }) => number >= start && number <= end,
  );
}

/**
 * Tenta descobrir a(s) sub-rede(s) /24 do dispositivo usando WebRTC.
 * Navegadores modernos podem ocultar o IP local (mDNS); nesse caso
 * retorna uma lista vazia.
 *
 * @param {number} [timeout=1000]
 * @returns {Promise<string[]>} Ex.: ["192.168.1.0/24"]
 */
export function detectLocalCidrs(timeout = LOCAL_DETECTION_TIMEOUT) {
  if (typeof RTCPeerConnection === "undefined") return Promise.resolve([]);

  return new Promise((resolve) => {
    const cidrs = new Set();
    let connection;
    let timer;

    const finish = () => {
      clearTimeout(timer);
      connection?.close();
      resolve([...cidrs]);
    };

    try {
      connection = new RTCPeerConnection({ iceServers: [] });
      timer = setTimeout(finish, timeout);

      connection.createDataChannel("");
      connection.onicecandidate = ({ candidate }) => {
        if (!candidate) return finish();

        // "candidate:<id> <comp> <proto> <prio> <endereço> <porta> typ ..."
        const address = candidate.candidate.split(" ")[4];
        if (isPrivateIpv4(address)) {
          cidrs.add(`${address.split(".").slice(0, 3).join(".")}.0/24`);
        }
      };

      connection
        .createOffer()
        .then((offer) => connection.setLocalDescription(offer))
        .catch(finish);
    } catch {
      finish();
    }
  });
}

/**
 * Faixas a varrer para cobrir a rede local: a sub-rede detectada ou,
 * se não for possível detectá-la, as sub-redes mais comuns.
 *
 * @returns {Promise<string[]>}
 */
export async function getLocalNetworkCidrs() {
  // O Vite insere estes valores ao iniciar ou compilar a interface.
  const cidrs = import.meta.env.LOCAL_NETWORK_CIDRS;
  if (Array.isArray(cidrs) && cidrs.length > 0) return cidrs;

  const detected = await detectLocalCidrs();
  return detected.length > 0 ? detected : COMMON_LOCAL_CIDRS;
}

function* generateIps(ranges) {
  for (const range of ranges) {
    const skipReserved = SKIP_RESERVED && !isReserved(range.start);

    for (let number = range.start; number <= range.end; number += 1) {
      if (skipReserved && isReserved(number)) continue;
      yield numberToIp(number);
    }
  }
}

async function isApiAvailable(apiUrl, timeout, path) {
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      signal: AbortSignal.timeout(timeout),
      redirect: "manual",
    });
    response.body?.cancel();
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Procura APIs que respondem 200 a GET em `path` (padrão "/") nas faixas
 * IPv4 informadas. Sem faixa, varre a rede local.
 *
 * @param {string | string[]} [cidr] Faixa(s) IPv4 em notação CIDR. Se
 *   omitido ou vazio, usa a rede local (detectada ou sub-redes comuns).
 * @param {object} [options]
 * @param {number} [options.port=3000]
 * @param {number} [options.concurrency=500]
 * @param {number} [options.timeout=1500]
 * @param {string} [options.path="/"] Caminho usado para verificar a API.
 * @param {(url: string) => void | Promise<void>} [options.onFound]
 *   Chamado uma vez por API encontrada. Se lançar erro, a busca é interrompida.
 * @returns {Promise<string[]>}
 */
export async function discoverApis(cidr, options = {}) {
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

  const requested = [cidr]
    .flat()
    .filter((item) => typeof item === "string" && item.trim());
  const cidrs =
    requested.length > 0 ? requested : await getLocalNetworkCidrs();

  const ranges = cidrs.map((item) => parseCidr(item.trim()));
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
      if (!(await isApiAvailable(apiUrl, timeout, path))) continue;
      if (discoveredApis.has(apiUrl)) continue; // faixas sobrepostas

      discoveredApis.add(apiUrl);
      try {
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
