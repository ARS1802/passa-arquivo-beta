const COLUMNS = ["name", "ip", "certificateHash"];
const HEADER = COLUMNS.join(",");
const DEFAULT_LOCAL_STORAGE_KEY = "passa-arquivo-peers";
function validateText(value, field) {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value)) {
    throw new TypeError(
      `${field} deve ser um texto não vazio, em uma única linha.`,
    );
  }
}

function parseRow(line) {
  // Aspas duplicadas representam uma aspa dentro de uma célula do CSV.
  const cell = /("(?:[^"]|"")*"|[^",]*)(,|$)/y;
  const values = [];
  let match;
  do {
    match = cell.exec(line);
    if (!match) throw new Error("Registro inválido em peers.csv.");
    const value = match[1];
    values.push(
      value.startsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value,
    );
  } while (match[2] === ",");

  if (values.length !== COLUMNS.length) {
    throw new Error(
      "Cada registro deve conter nome, IPv4 e hash do certificado.",
    );
  }
  return values;
}

export default class Peer {
  #name;
  #ip;
  #certificateHash;

  constructor(name, ip, certificateHash) {
    validateText(name, "Nome");
    validateText(certificateHash, "Hash do certificado");
    this.#name = name;
    this.#certificateHash = certificateHash;
    this.ip = ip;
  }

  // Nome e certificado identificam o dispositivo; somente o IP pode mudar.
  get name() {
    return this.#name;
  }
  get ip() {
    return this.#ip;
  }
  get certificateHash() {
    return this.#certificateHash;
  }

  set ip(value) {
    const octets = typeof value === "string" ? value.split(".") : [];
    if (
      octets.length !== 4 ||
      !octets.every(
        (octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255,
      )
    ) {
      throw new TypeError("Informe um endereço IPv4 válido.");
    }
    this.#ip = value;
  }

  toJSON() {
    return {
      name: this.name,
      ip: this.ip,
      certificateHash: this.certificateHash,
    };
  }

  /** Converte o conteúdo do CSV em Peers, inclusive no navegador. */
  static fromCsv(csv) {
    if (typeof csv !== "string")
      throw new TypeError("Informe o conteúdo do CSV.");
    if (!csv) return [];
    const lines = csv.replace(/\r?\n$/, "").split(/\r?\n/);
    if (lines.shift() !== HEADER)
      throw new Error(`Cabeçalho esperado: ${HEADER}.`);
    const peers = lines.map((line) => new Peer(...parseRow(line)));
    if (
      new Set(peers.map((peer) => peer.certificateHash)).size !== peers.length
    ) {
      throw new Error("Há hashes de certificado duplicados em peers.csv.");
    }
    return peers;
  }

  static async #file() {
    if (typeof window !== "undefined") {
      throw new Error(
        "O arquivo peers.csv deve ser acessado pelo servidor Node.js.",
      );
    }
    // O import fica aqui para permitir usar a classe no navegador sem carregar fs.
    const fs = await import("node:fs");
    return { fs, path: new URL("./peers.csv", import.meta.url) };
  }

  static #readCsv(fs, path) {
    try {
      return fs.readFileSync(path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return `${HEADER}\n`;
      throw error;
    }
  }

  static #writePeers(fs, path, peers) {
    const rows = peers.map((peer) =>
      COLUMNS.map((column) => `"${peer[column].replaceAll('"', '""')}"`).join(
        ",",
      ),
    );
    fs.writeFileSync(path, [HEADER, ...rows, ""].join("\n"), "utf8");
  }

  /** Node.js: lê exclusivamente model/peers.csv, independentemente da pasta atual. */
  async readCsv() {
    const { fs, path } = await Peer.#file();
    return Peer.#readCsv(fs, path);
  }

  async getPeers() {
    return Peer.fromCsv(await this.readCsv());
  }

  /** Node.js: cadastra outro Peer ou atualiza seu IP pelo hash, sem duplicá-lo. */
  async savePeer(peer) {
    if (!(peer instanceof Peer))
      throw new TypeError("Informe uma instância de Peer.");
    const { fs, path } = await Peer.#file();
    // Não há await entre a leitura e a escrita, evitando sobreposição neste processo.
    const peers = Peer.fromCsv(Peer.#readCsv(fs, path));
    const index = peers.findIndex(
      (item) => item.certificateHash === peer.certificateHash,
    );
    if (index === -1) {
      peers.push(peer);
    } else {
      if (peers[index].name !== peer.name)
        throw new Error("O nome do Peer é imutável.");
      peers[index] = peer;
    }
    Peer.#writePeers(fs, path, peers);
  }

  /** Node.js: remove pelo hash; retorna false quando o registro não existe. */
  async removePeer(certificateHash) {
    validateText(certificateHash, "Hash do certificado");
    const { fs, path } = await Peer.#file();
    const peers = Peer.fromCsv(Peer.#readCsv(fs, path));
    const remaining = peers.filter(
      (peer) => peer.certificateHash !== certificateHash,
    );
    if (remaining.length === peers.length) return false;
    Peer.#writePeers(fs, path, remaining);
    return true;
  }

  /**
   * Navegador: recebe o CSV entregue pelo Controller e armazena JSON no localStorage.
   * Sem filtros, salva todos os registros; certificateHash seleciona um registro;
   * column seleciona name, ip ou certificateHash. Os filtros podem ser combinados.
   * Ex.: peer.saveToLocalStorage(csv, { column: "ip", key: "ips-dos-peers" }).
   */
  saveToLocalStorage(
    csv,
    { certificateHash, column, key = DEFAULT_LOCAL_STORAGE_KEY } = {},
  ) {
    if (column !== undefined && !COLUMNS.includes(column)) {
      throw new Error(`Coluna inválida. Use: ${COLUMNS.join(", ")}.`);
    }
    validateText(key, "Chave do localStorage");
    const peers = Peer.fromCsv(csv);
    let value;
    if (certificateHash !== undefined) {
      const peer = peers.find(
        (item) => item.certificateHash === certificateHash,
      );
      if (!peer) throw new Error("Peer não encontrado no CSV.");
      value = column === undefined ? peer.toJSON() : peer[column];
    } else {
      value = peers.map((peer) =>
        column === undefined ? peer.toJSON() : peer[column],
      );
    }
    if (typeof localStorage === "undefined") {
      throw new Error(
        "O localStorage está disponível apenas no ambiente do navegador.",
      );
    }
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  }
}
