import { downloadFile } from "./download.js";
import { discoverPeers as scanNetwork, isValidIpv4 } from "./discovery.js";
import { listFiles } from "./list.js";
import { uploadFile } from "./upload.js";

// O cadastro pertence à máquina local, mesmo quando outro Peer está selecionado.
const LOCAL_API_URL = import.meta.env.LOCAL_API_URL;

function isPeer(peer) {
  return peer && typeof peer === "object" && !Array.isArray(peer) &&
    typeof peer.nome === "string" && peer.nome.trim() &&
    typeof peer.id === "string" && peer.id.trim() && isValidIpv4(peer.ip);
}

export class API {
  constructor() {
    this.targetPeer = null;
    this.LOCAL_STORAGE_KEY = "passa-arquivo-peers";
  }

  // A URL acompanha o IP atual do alvo, sem manter uma segunda cópia do estado.
  get targetPeerURL() {
    return this.targetPeer ? `http://${this.targetPeer.ip}:3000` : "";
  }

  #getTargetPeerURL() {
    if (!this.targetPeer) throw new Error("Selecione um Peer antes de acessar arquivos.");
    return this.targetPeerURL;
  }

  #readStoredPeers() {
    if (typeof localStorage === "undefined") return [];
    try {
      const peers = JSON.parse(localStorage.getItem(this.LOCAL_STORAGE_KEY) || "[]");
      return Array.isArray(peers) ? peers.filter(isPeer) : [];
    } catch {
      // Um cache inválido não deve impedir a consulta ao cadastro da API local.
      return [];
    }
  }

  #storePeers(peers) {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(peers));
    }
  }

  #cachePeers(peers) {
    // O id permanece o mesmo quando o dispositivo troca de endereço IPv4.
    const stored = new Map(this.#readStoredPeers().map((peer) => [peer.id, peer]));
    for (const peer of peers) stored.set(peer.id, peer);
    this.#storePeers([...stored.values()]);
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
    if (entries.some(([key, value]) =>
      !["nome", "ip", "id"].includes(key) || typeof value !== "string" || !value.trim()
    )) {
      throw new TypeError("Use nome, ip ou id com valores de texto não vazios.");
    }

    const response = await fetch(`${LOCAL_API_URL}/peer`);
    if (!response.ok) throw new Error(`Não foi possível obter os Peers (${response.status}).`);
    const result = await response.json();
    if (!result || !Array.isArray(result.peers) || !result.peers.every(isPeer)) {
      throw new Error("A resposta da API não contém uma lista de Peers válida.");
    }
    if (entries.length === 0) return result.peers;

    const matches = result.peers.filter((peer) =>
      entries.every(([key, value]) => peer[key] === value),
    );
    if (matches.length > 1) throw new Error("Mais de um Peer corresponde ao filtro. Informe o id.");
    return matches[0] ?? null;
  }

  async setPeerAtLocalStorage(id) {
    const peer = await this.getPeer({ id });
    if (!peer) throw new Error("Peer não encontrado.");
    this.#cachePeers([peer]);
    return peer;
  }

  removePeerAtLocalStorage(id) {
    this.#storePeers(this.#readStoredPeers().filter((peer) => peer.id !== id));
  }

  async deletePeer(id) {
    if (typeof id !== "string" || !id.trim()) throw new TypeError("Informe o id do Peer.");
    const response = await fetch(`${LOCAL_API_URL}/peer/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (response.status !== 204) {
      throw new Error(`Não foi possível excluir o Peer (${response.status}).`);
    }
    if (this.targetPeer?.id === id) this.targetPeer = null;
    this.removePeerAtLocalStorage(id);
  }

  listFiles(...parameters) {
    return listFiles(this.#getTargetPeerURL(), ...parameters);
  }

  downloadFile(...parameters) {
    return downloadFile(this.#getTargetPeerURL(), ...parameters);
  }

  uploadFile(...parameters) {
    return uploadFile(this.#getTargetPeerURL(), ...parameters);
  }
}

export const api = new API();
export default api;
