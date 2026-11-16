import os from "node:os";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

class Network {
  #cidrs = Object.freeze([]);
  #vitePort;

  constructor() {
    this.#exportVitePort();
    this.obtainCidrs();
  }

  #exportVitePort() {
    // API e Vite leem o mesmo .env da raiz, independentemente da pasta atual.
    config({
      path: fileURLToPath(new URL("../.env", import.meta.url)),
      quiet: true,
    });
    process.env.VITE_PORT ??= "5173";
    const vitePort = Number(process.env.VITE_PORT);
    if (!Number.isInteger(vitePort) || vitePort < 1 || vitePort > 65535) {
      throw new Error("VITE_PORT deve ser uma porta inteira entre 1 e 65535.");
    }
    this.#vitePort = vitePort;
  }

  get vitePort() {
    return this.#vitePort;
  }

  // O getter permite consultar a lista, sem substituir o atributo por fora da classe.
  get cidrs() {
    return this.#cidrs;
  }

  /** Retorna o IP de cada CIDR, sem o prefixo da sub-rede (ex.: /24). */
  getIps() {
    return this.#cidrs.map((cidr) => cidr.split("/")[0]);
  }

  /** Atualiza as sub-redes IPv4 locais, ignorando interfaces internas. */
  obtainCidrs() {
    const cidrs = Object.values(os.networkInterfaces())
      .flatMap((addresses) => addresses ?? [])
      .filter(
        (address) =>
          (address.family === "IPv4" || address.family === 4) &&
          !address.internal &&
          address.cidr,
      )
      .map((address) => address.cidr);

    // Congelar a lista também impede alterações externas com push, splice ou índices.
    this.#cidrs = Object.freeze(cidrs);
  }
}

// Os módulos que importam este arquivo compartilham a mesma instância.
const network = new Network();
export default network;
