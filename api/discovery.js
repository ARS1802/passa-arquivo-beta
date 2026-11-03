const DEFAULT_PORT = 3000;
const DEFAULT_TIMEOUT = 500;
const DEFAULT_CONCURRENCY = 64;

export function isValidIpv4(ip) {
  const octets = ip.split(".");

  return (
    octets.length === 4 &&
    octets.every((octet) => {
      const value = Number(octet);
      return /^\d+$/.test(octet) && value >= 0 && value <= 255;
    })
  );
}

export function getCurrentIp() {
  const configuredIp = import.meta.env.VITE_LOCAL_IP;
  if (configuredIp && isValidIpv4(configuredIp)) {
    return configuredIp;
  }

  const browserIp =
    typeof window !== "undefined" ? window.location.hostname : "";
  if (isValidIpv4(browserIp)) {
    return browserIp;
  }

  return "";
}

function ipToNumber(ip) {
  return ip
    .split(".")
    .reduce((number, octet) => number * 256 + Number(octet), 0);
}

function numberToIp(number) {
  return [24, 16, 8, 0].map((shift) => (number >>> shift) & 255).join(".");
}

/**
 * Gera os endereços utilizáveis da sub-rede IPv4 local.
 *
 * @param {string} localIp - IPv4 da máquina conectada à rede.
 * @param {number} prefixLength - Prefixo da rede, por padrão /24.
 * @returns {string[]}
 */
export function getNetworkAddresses(localIp, prefixLength = 24) {
  if (!isValidIpv4(localIp)) {
    throw new Error("Informe um endereço IPv4 válido.");
  }

  if (!Number.isInteger(prefixLength) || prefixLength < 16 || prefixLength > 30) {
    throw new Error("O prefixo da rede deve estar entre /16 e /30.");
  }

  const hostBits = 32 - prefixLength;
  const size = 2 ** hostBits;
  const mask = (0xffffffff << hostBits) >>> 0;
  const network = ipToNumber(localIp) & mask;

  return Array.from({ length: size - 2 }, (_, index) =>
    numberToIp(network + index + 1),
  );
}

function getDiscoveryAddresses(localIp, prefixLength) {
  if (localIp.startsWith("192.168.")) {
    return getNetworkAddresses("192.168.0.1", 16);
  }

  return getNetworkAddresses(localIp, prefixLength);
}

async function isApiAvailable(apiUrl, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${apiUrl}/`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Procura APIs disponíveis na rede local.
 *
 * @param {string} localIp - IPv4 da máquina conectada à rede.
 * @param {object} [options]
 * @param {number} [options.port=3000] - Porta da API nos demais hosts.
 * @param {number} [options.prefixLength=24] - Prefixo da rede local.
 * @param {number} [options.timeout=800] - Tempo máximo de cada teste em ms.
 * @param {number} [options.concurrency=32] - Quantidade máxima de testes simultâneos.
 * @returns {Promise<string[]>} URLs das APIs encontradas.
 */
export async function discoverApis(localIp, options = {}) {
  const resolvedIp = localIp || getCurrentIp() || "192.168.0.1";
  const {
    port = DEFAULT_PORT,
    prefixLength = 24,
    timeout = DEFAULT_TIMEOUT,
    concurrency = DEFAULT_CONCURRENCY,
  } = options;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Informe uma porta válida.");
  }

  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new Error("Informe um timeout positivo.");
  }

  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("Informe uma concorrência positiva.");
  }

  const addresses = getDiscoveryAddresses(resolvedIp, prefixLength);
  const discoveredApis = [];

  for (let index = 0; index < addresses.length; index += concurrency) {
    const batch = addresses.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async (address) => {
        const apiUrl = `http://${address}:${port}`;
        return (await isApiAvailable(apiUrl, timeout)) ? apiUrl : null;
      }),
    );

    discoveredApis.push(...results.filter(Boolean));
  }

  return discoveredApis;
}

export default discoverApis;
