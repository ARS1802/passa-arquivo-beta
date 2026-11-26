import { downloadFile, listFiles, uploadFile } from "./files.js";
import {
  discoverPeers as scanNetwork,
  isPeer,
  getPeers,
  deletePeer,
} from "./peers.js";
import { getSharedDir, setSharedDir } from "./dir.js";
import { exchangeKeys } from "./key.js";
import { getLocalIdentity, setLocalName } from "./identity.js";

// O cadastro pertence à máquina local, mesmo quando outro Peer está selecionado.
const LOCAL_API_URL = import.meta.env.LOCAL_API_URL;

// Coordena os fetchers das rotas e mantém a seleção e o cache usados pela View.
export class Fetcher {
  constructor() {
    this.targetPeer = null;
    this.LOCAL_STORAGE_KEY = "passa-arquivo-peers";
  }

  // A URL acompanha o IP atual do alvo, sem manter uma segunda cópia do estado.
  get targetPeerURL() {
    return this.targetPeer ? `http://${this.targetPeer.ip}:3000` : "";
  }

  #getTargetPeerURL() {
    if (!this.targetPeer)
      throw new Error("Selecione um Peer antes de acessar arquivos.");
    return this.targetPeerURL;
  }

  #readStorage() {
    const empty = { peers: [], SHARED_DIR: null };
    if (typeof localStorage === "undefined") return empty;
    try {
      const stored = JSON.parse(
        localStorage.getItem(this.LOCAL_STORAGE_KEY) || "null",
      );
      // Preserva os peers de instalações que ainda guardam somente um array.
      if (Array.isArray(stored))
        return { ...empty, peers: stored.filter(isPeer) };
      return {
        peers: Array.isArray(stored?.peers) ? stored.peers.filter(isPeer) : [],
        SHARED_DIR:
          typeof stored?.SHARED_DIR === "string" && stored.SHARED_DIR.trim()
            ? stored.SHARED_DIR
            : null,
      };
    } catch {
      // Um cache inválido não deve impedir a consulta ao cadastro da API local.
      return empty;
    }
  }

  #store(changes) {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(
        this.LOCAL_STORAGE_KEY,
        JSON.stringify({ ...this.#readStorage(), ...changes }),
      );
    }
  }

  #cachePeers(peers) {
    // O id permanece o mesmo quando o dispositivo troca de endereço IPv4.
    const stored = new Map(
      this.#readStorage().peers.map((peer) => [peer.id, peer]),
    );
    for (const peer of peers) stored.set(peer.id, peer);
    this.#store({ peers: [...stored.values()] });
  }

  get sharedDir() {
    return this.#readStorage().SHARED_DIR;
  }

  getLocalIdentity() {
    return getLocalIdentity(LOCAL_API_URL);
  }

  async exchangeKeys(apiUrl, { signal } = {}) {
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000);
    const identity = await getLocalIdentity(LOCAL_API_URL, {
      signal: requestSignal,
    });
    return exchangeKeys(apiUrl, identity, {
      localApiUrl: LOCAL_API_URL,
      signal: requestSignal,
    });
  }

  setLocalName(nome) {
    return setLocalName(LOCAL_API_URL, nome);
  }

  async getSharedDir() {
    const directory = await getSharedDir(LOCAL_API_URL);
    // Após reiniciar a API, a pasta salva passa novamente pela validação no Model.
    if (!directory && this.sharedDir) return this.setSharedDir(this.sharedDir);
    this.#store({ SHARED_DIR: directory });
    return directory;
  }

  async setSharedDir(directory) {
    const sharedDir = await setSharedDir(LOCAL_API_URL, directory);
    this.#store({ SHARED_DIR: sharedDir });
    return sharedDir;
  }

  /** Descobre e salva Peers em paralelo, sem escolher um alvo pelo usuário. */
  async discoverPeers({ signal } = {}) {
    const discovered = await scanNetwork({ signal });
    if (discovered.length === 0) return [];

    // O cadastro preserva o nome de ids conhecidos; usamos sua versão salva.
    const ids = new Set(discovered.map((peer) => peer.id));
    const peers = (await this.getPeer()).filter((peer) => ids.has(peer.id));
    this.#cachePeers(peers);
    const current = peers.find((peer) => peer.id === this.targetPeer?.id);
    if (current) this.targetPeer = current;
    return peers;
  }

  /** Seleciona um único registro salvo. Nomes/IPs ambíguos exigem o id. */
  async selectPeer(criteria) {
    if (!criteria || Object.keys(criteria).length === 0) {
      throw new TypeError("Informe nome, ip ou id para selecionar um Peer.");
    }
    const peer = await this.getPeer(criteria);
    if (!peer) throw new Error("Peer não encontrado.");
    this.#cachePeers([peer]);
    this.targetPeer = peer;
    return peer;
  }

  /** Sem filtro (ou com {}), retorna todos; com filtro, retorna um Peer ou null. */
  async getPeer(criteria = {}) {
    if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) {
      throw new TypeError("Informe um objeto com nome, ip ou id.");
    }
    const entries = Object.entries(criteria);
    if (
      entries.some(
        ([key, value]) =>
          !["nome", "ip", "id"].includes(key) ||
          typeof value !== "string" ||
          !value.trim(),
      )
    ) {
      throw new TypeError(
        "Use nome, ip ou id com valores de texto não vazios.",
      );
    }

    const peers = await getPeers(LOCAL_API_URL);
    if (entries.length === 0) return peers;

    const matches = peers.filter((peer) =>
      entries.every(([key, value]) => peer[key] === value),
    );
    if (matches.length > 1)
      throw new Error("Mais de um Peer corresponde ao filtro. Informe o id.");
    return matches[0] ?? null;
  }

  async setPeerAtLocalStorage(id) {
    const peer = await this.getPeer({ id });
    if (!peer) throw new Error("Peer não encontrado.");
    this.#cachePeers([peer]);
    return peer;
  }

  removePeerAtLocalStorage(id) {
    this.#store({
      peers: this.#readStorage().peers.filter((peer) => peer.id !== id),
    });
  }

  async deletePeer(id) {
    if (typeof id !== "string" || !id.trim())
      throw new TypeError("Informe o id do Peer.");
    await deletePeer(LOCAL_API_URL, id);
    if (this.targetPeer?.id === id) this.targetPeer = null;
    this.removePeerAtLocalStorage(id);
  }

  listFiles(directoryPath = "") {
    const url = this.#getTargetPeerURL();
    // O cabeçalho identifica quem pede o arquivo, mesmo ao acessar outro Peer.
    return this.getLocalIdentity().then(({ id }) =>
      listFiles(url, directoryPath, id),
    );
  }

  downloadFile(filePath) {
    const url = this.#getTargetPeerURL();
    return this.getLocalIdentity().then(({ id }) =>
      downloadFile(url, filePath, id),
    );
  }

  uploadFile(file) {
    const url = this.#getTargetPeerURL();
    return this.getLocalIdentity().then(({ id }) => uploadFile(url, file, id));
  }
}

export const fetcher = new Fetcher();
export default fetcher;
