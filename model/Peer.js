import { createPublicKey, randomUUID } from "node:crypto";
import { createReadStream, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isIPv4 } from "node:net";
import { createInterface } from "node:readline";
import network from "./Network.js";
import Security from "./Security.js";

const IDENTITY_FILE = new URL("./identity.json", import.meta.url);
const PEERS_FILE = new URL("../controller/peers.csv", import.meta.url);
const COLUMNS = ["nome", "ip", "id", "publicKey"];
const HEADER = COLUMNS.join(",");

function validateNome(nome) {
  if (
    typeof nome !== "string" || !nome.trim() ||
    [...nome].length > 15 || /\s/u.test(nome)
  ) {
    throw new TypeError("O nome deve ter de 1 a 15 caracteres, sem espaços.");
  }
}

function validateId(id) {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new TypeError("O id deve ser um UUID gerado por randomUUID().");
  }
}

function validateIp(ip) {
  if (typeof ip !== "string" || !isIPv4(ip)) {
    throw new TypeError("Informe um endereço IPv4 válido.");
  }
}

function validatePublicKey(publicKey) {
  try {
    if (typeof publicKey !== "string" || !publicKey.startsWith("-----BEGIN PUBLIC KEY-----")) {
      throw new Error("Formato inválido.");
    }
    const key = createPublicKey(publicKey);
    if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails.modulusLength < 3072) {
      throw new Error("Chave incompatível.");
    }
  } catch {
    throw new TypeError("Informe publicKey em PEM com uma chave pública RSA de pelo menos 3072 bits.");
  }
}

export function validatePublicIdentity(peer, allowEmptyName = false) {
  if (!peer || typeof peer !== "object" || Array.isArray(peer)) {
    throw new TypeError("Informe uma identidade com nome, ip e publicKey.");
  }
  // O registro local pode ser salvo antes de o usuário escolher um nome.
  if (!allowEmptyName || peer.nome !== "") validateNome(peer.nome);
  validateIp(peer.ip);
  validatePublicKey(peer.publicKey);
}

export function validatePeer(peer, allowEmptyName = false) {
  validatePublicIdentity(peer, allowEmptyName);
  validateId(peer.id);
}

function readFile(file, fallback) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function writeFile(file, content) {
  // Só substitui o arquivo original depois que o novo conteúdo estiver escrito.
  const temporaryFile = new URL(`${file.href}.tmp`);
  writeFileSync(temporaryFile, content, "utf8");
  renameSync(temporaryFile, file);
}

function parseRow(line) {
  // No CSV, aspas duplicadas representam uma aspa dentro da célula.
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
    throw new Error("Cada registro deve conter nome, ip, id e publicKey.");
  }
  const peer = Object.fromEntries(COLUMNS.map((column, index) => [column, values[index]]));
  // A célula contém uma string JSON para manter as quebras de linha do PEM escapadas.
  peer.publicKey = JSON.parse(peer.publicKey);
  return peer;
}

export default class Peer {
  static #instance;
  #nome;
  #ip;
  #id;
  #publicKey;

  constructor(nome) {
    if (Peer.#instance) return Peer.#instance;

    const stored = readFile(IDENTITY_FILE, null);
    const identity = stored === null
      ? { nome, id: randomUUID() }
      : JSON.parse(stored);

    // Uma identidade inválida não é sobrescrita: isso evita perder o id da máquina.
    if (!identity || typeof identity !== "object" || Array.isArray(identity) ||
        (stored !== null && !Object.hasOwn(identity, "ip"))) {
      throw new Error("identity.json deve conter ip e id.");
    }
    network.obtainCidrs();
    // generateKeys também carrega e valida um par existente, sem substituí-lo.
    Security.generateKeys();
    const current = {
      nome: identity.nome, id: identity.id, ip: network.getIps()[0],
      publicKey: Security.publicKey,
    };
    // O nome pode ficar pendente até o usuário concluir a NamingScreen.
    if (current.nome != null) validateNome(current.nome);
    validateId(current.id);
    validateIp(current.ip);
    this.#nome = current.nome;
    this.#ip = current.ip;
    this.#id = current.id;
    this.#publicKey = current.publicKey;
    this.#saveIdentity(current);
    Object.freeze(this);
    Peer.#instance = this;
  }

  #readIdentity() {
    return JSON.parse(readFileSync(IDENTITY_FILE, "utf8"));
  }

  #saveIdentity(identity) {
    const peers = this.getPeers();
    const first = peers.shift();
    // O primeiro registro divergente é preservado no fim do cadastro.
    if (first && first.id !== identity.id) peers.push(first);
    const others = peers.filter((peer) => peer.id !== identity.id);
    const local = { nome: identity.nome ?? "", ip: identity.ip, id: identity.id, publicKey: identity.publicKey };
    writeFile(IDENTITY_FILE, `${JSON.stringify(identity, null, 2)}\n`);
    this.#writePeers([local, ...others]);
  }

  get nome() {
    this.#nome = this.#readIdentity().nome;
    return this.#nome;
  }

  set nome(value) {
    validateNome(value);
    const identity = { ...this.#readIdentity(), nome: value };
    this.#saveIdentity(identity);
    this.#nome = value;
  }

  get ip() {
    this.#ip = this.#readIdentity().ip;
    return this.#ip;
  }

  // Sem setter: o id é criado uma única vez e permanece na identidade persistida.
  get id() {
    this.#id = this.#readIdentity().id;
    return this.#id;
  }

  get publicKey() {
    return this.#publicKey;
  }

  toJSON() {
    return { nome: this.nome, ip: this.ip, id: this.id, publicKey: this.publicKey };
  }

  /** Retorna registros simples; somente esta máquina é uma instância de Peer. */
  getPeers() {
    const csv = readFile(PEERS_FILE, "") || `${HEADER}\n`;
    const lines = csv.replace(/\r?\n$/, "").split(/\r?\n/);
    if (lines.shift() !== HEADER) {
      throw new Error(`Cabeçalho esperado em peers.csv: ${HEADER}.`);
    }
    const peers = lines.map(parseRow);
    const ids = new Set();
    for (const peer of peers) {
      validatePeer(peer, true);
      if (ids.has(peer.id)) throw new Error("Há ids duplicados em peers.csv.");
      ids.add(peer.id);
    }
    return peers;
  }

  /** Consulta o cadastro linha a linha, sem carregar todo o CSV na memória. */
  async isRegistered(id) {
    try {
      validateId(id);
    } catch {
      return false;
    }

    const input = createReadStream(PEERS_FILE, { encoding: "utf8" });
    const lines = createInterface({ input, crlfDelay: Infinity });
    try {
      let isHeader = true;
      for await (const line of lines) {
        if (isHeader) {
          if (line !== HEADER) throw new Error(`Cabeçalho esperado em peers.csv: ${HEADER}.`);
          isHeader = false;
          continue;
        }
        const peer = parseRow(line);
        validatePeer(peer, true);
        if (peer.id === id) return true; // early exit: encontrou, não precisa percorrer os demais.
      }
      return false;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    } finally {
      // O return antecipado também passa aqui e encerra a leitura do arquivo.
      lines.close();
      input.destroy();
    }
  }

  #writePeers(peers) {
    const rows = peers.map((peer) => COLUMNS.map(
      (column) => {
        // JSON escapa as quebras do PEM; as aspas são escapadas conforme o CSV.
        const value = column === "publicKey" ? JSON.stringify(peer[column]) : peer[column];
        return `"${value.replaceAll('"', '""')}"`;
      },
    ).join(","));
    writeFile(PEERS_FILE, [HEADER, ...rows, ""].join("\n"));
  }

  /** Cadastra a identidade recebida do outro dispositivo, sem gerar outro id. */
  appendPeer(peer) {
    validatePeer(peer);
    const peers = this.getPeers();
    if (peers.some((item) => item.id === peer.id)) {
      throw new Error("Já existe um peer com esse id.");
    }
    peers.push({ nome: peer.nome, ip: peer.ip, id: peer.id, publicKey: peer.publicKey });
    this.#writePeers(peers);
  }

  /** Na descoberta, um id conhecido conserva seu nome e atualiza apenas o IP. */
  savePeer(peer) {
    validatePeer(peer);
    // A descoberta não altera os dados da própria máquina.
    if (peer.id === this.id) return;
    const peers = this.getPeers();
    const existing = peers.find((item) => item.id === peer.id);
    if (existing) {
      if (existing.publicKey !== peer.publicKey) {
        throw new TypeError("A chave pública recebida difere da cadastrada para este peer.");
      }
      if (existing.ip === peer.ip) return;
      existing.ip = peer.ip;
    } else {
      peers.push({ nome: peer.nome, ip: peer.ip, id: peer.id, publicKey: peer.publicKey });
    }
    this.#writePeers(peers);
  }

  /** Atualiza somente nome e/ou ip; retorna false quando o id não existe. */
  updatePeer(id, changes) {
    validateId(id);
    if (id === this.id) throw new TypeError("Use o setter nome para alterar a identidade local.");
    if (!changes || typeof changes !== "object" || Array.isArray(changes) ||
        Object.keys(changes).some((column) => !["nome", "ip"].includes(column))) {
      throw new TypeError("Somente as colunas nome e ip podem ser modificadas.");
    }
    const peers = this.getPeers();
    const index = peers.findIndex((peer) => peer.id === id);
    if (index === -1) return false;
    const updated = { ...peers[index], ...changes };
    validatePeer(updated);
    peers[index] = updated;
    this.#writePeers(peers);
    return true;
  }

  removePeer(id) {
    validateId(id);
    if (id === this.id) throw new TypeError("O próprio Peer não pode ser removido do cadastro.");
    const peers = this.getPeers();
    const remaining = peers.filter((peer) => peer.id !== id);
    if (remaining.length === peers.length) return false;
    this.#writePeers(remaining);
    return true;
  }
}
