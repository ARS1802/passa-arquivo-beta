import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { isIPv4 } from "node:net";
import network from "./Network.js";

const IDENTITY_FILE = new URL("./identity.json", import.meta.url);
const PEERS_FILE = new URL("../controller/peers.csv", import.meta.url);
const COLUMNS = ["nome", "ip", "id"];
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

function validatePeer(peer) {
  if (!peer || typeof peer !== "object" || Array.isArray(peer)) {
    throw new TypeError("Informe uma identidade com nome, ip e id.");
  }
  validateNome(peer.nome);
  validateId(peer.id);
  if (typeof peer.ip !== "string" || !isIPv4(peer.ip)) {
    throw new TypeError("Informe um endereço IPv4 válido.");
  }
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
    throw new Error("Cada registro deve conter nome, ip e id.");
  }
  return Object.fromEntries(COLUMNS.map((column, index) => [column, values[index]]));
}

export default class Peer {
  static #instance;
  #nome;
  #ip;
  #id;

  constructor(nome) {
    if (Peer.#instance) return Peer.#instance;

    const stored = readFile(IDENTITY_FILE, null);
    const identity = stored === null
      ? { nome, id: randomUUID() }
      : JSON.parse(stored);

    // Uma identidade inválida não é sobrescrita: isso evita perder o id da máquina.
    if (!identity || typeof identity !== "object" ||
        (stored !== null && !Object.hasOwn(identity, "ip"))) {
      throw new Error("identity.json deve conter nome, ip e id.");
    }
    network.obtainCidrs();
    const current = { nome: identity.nome, id: identity.id, ip: network.getIps()[0] };
    validatePeer(current);
    this.#nome = current.nome;
    this.#ip = current.ip;
    this.#id = current.id;
    writeFile(IDENTITY_FILE, `${JSON.stringify(this, null, 2)}\n`);
    Object.freeze(this);
    Peer.#instance = this;
  }

  get nome() {
    return this.#nome;
  }

  set nome(value) {
    validateNome(value);
    writeFile(IDENTITY_FILE, `${JSON.stringify({ ...this.toJSON(), nome: value }, null, 2)}\n`);
    this.#nome = value;
  }

  get ip() {
    return this.#ip;
  }

  // Sem setter: o id é criado uma única vez e permanece na identidade persistida.
  get id() {
    return this.#id;
  }

  toJSON() {
    return { nome: this.nome, ip: this.ip, id: this.id };
  }

  /** Retorna registros simples; somente esta máquina é uma instância de Peer. */
  getPeers() {
    const csv = readFile(PEERS_FILE, `${HEADER}\n`);
    const lines = csv.replace(/\r?\n$/, "").split(/\r?\n/);
    if (lines.shift() !== HEADER) {
      throw new Error(`Cabeçalho esperado em peers.csv: ${HEADER}.`);
    }
    const peers = lines.map(parseRow);
    const ids = new Set();
    for (const peer of peers) {
      validatePeer(peer);
      if (ids.has(peer.id)) throw new Error("Há ids duplicados em peers.csv.");
      ids.add(peer.id);
    }
    return peers;
  }

  #writePeers(peers) {
    const rows = peers.map((peer) => COLUMNS.map(
      (column) => `"${peer[column].replaceAll('"', '""')}"`,
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
    peers.push({ nome: peer.nome, ip: peer.ip, id: peer.id });
    this.#writePeers(peers);
  }

  /** Na descoberta, um id conhecido conserva seu nome e atualiza apenas o IP. */
  savePeer(peer) {
    validatePeer(peer);
    const peers = this.getPeers();
    const existing = peers.find((item) => item.id === peer.id);
    if (existing) {
      if (existing.ip === peer.ip) return;
      existing.ip = peer.ip;
    } else {
      peers.push({ nome: peer.nome, ip: peer.ip, id: peer.id });
    }
    this.#writePeers(peers);
  }

  /** Atualiza somente nome e/ou ip; retorna false quando o id não existe. */
  updatePeer(id, changes) {
    validateId(id);
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
    const peers = this.getPeers();
    const remaining = peers.filter((peer) => peer.id !== id);
    if (remaining.length === peers.length) return false;
    this.#writePeers(remaining);
    return true;
  }
}
