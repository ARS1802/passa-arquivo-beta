import os from "node:os";

class Network {
  #cidrs = Object.freeze([]);

  // O getter permite consultar a lista, sem substituir o atributo por fora da classe.
  get cidrs() {
    return this.#cidrs;
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
network.obtainCidrs();
export default network;
