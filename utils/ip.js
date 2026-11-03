import os from "node:os";

/**
 * Retorna o primeiro endereço IPv4 não interno disponível na máquina.
 *
 * @returns {string | undefined} O endereço encontrado ou `undefined`.
 */
export default function getLocalIp() {
  const interfaces = os.networkInterfaces();

  for (const interfaceAddresses of Object.values(interfaces)) {
    for (const network of interfaceAddresses ?? []) {
      if (network.family === "IPv4" && !network.internal) {
        return network.address;
      }
    }
  }

  return undefined;
}