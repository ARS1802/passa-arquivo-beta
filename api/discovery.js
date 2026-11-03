const DEFAULT_PORT = 3000;
const DEFAULT_CIDR = "192.168.0.0/24";
const DEFAULT_CONCURRENCY = 500;
const DEFAULT_TIMEOUT = 1500;
const DEFAULT_PATH = "/";
const SKIP_RESERVED = true;

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

function isReserved(number) {
  return RESERVED_RANGES.some(
    ({ start, end }) => number >= start && number <= end,
  );
}

function* generateIps(range, skipReserved) {
  for (let number = range.start; number <= range.end; number += 1) {
    if (skipReserved && isReserved(number)) continue;
    yield numberToIp(number);
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
 * Procura APIs disponíveis em uma faixa IPv4.
 *
 * @param {string} [cidr=192.168.0.0/24] Faixa IPv4 em notação CIDR.
 * @param {object} [options]
 * @param {number} [options.port=3000]
 * @param {number} [options.concurrency=500]
 * @param {number} [options.timeout=1500]
 * @param {string} [options.path="/"] Caminho usado para verificar a API.
 * @param {(url: string) => void | Promise<void>} [options.onFound]
 * @returns {Promise<string[]>}
 */
export async function discoverApis(cidr = DEFAULT_CIDR, options = {}) {
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

  const range = parseCidr(cidr);
  const skipReserved = SKIP_RESERVED && !isReserved(range.start);
  const iterator = generateIps(range, skipReserved);
  const discoveredApis = [];

  const testNext = async () => {
    for (;;) {
      const { value: address, done } = iterator.next();
      if (done) return;

      const apiUrl = `http://${address}:${port}`;
      if (await isApiAvailable(apiUrl, timeout, path)) {
        discoveredApis.push(apiUrl);
        await onFound?.(apiUrl);
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, range.end - range.start + 1) },
      testNext,
    ),
  );

  return discoveredApis;
}

export default discoverApis;
