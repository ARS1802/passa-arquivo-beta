import { downloadFile } from "./download.js";
import { discoverApis as scanNetwork } from "./discovery.js";
import { listFiles } from "./list.js";
import { uploadFile } from "./upload.js";

const STORAGE_KEY = "passa-arquivo-api-urls";
const DEFAULT_API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

class Api {
  constructor() {
    this.apiUrl = this.readStoredApiUrls();
    this.selectedApiUrl = this.apiUrl[0];
  }

  readStoredApiUrls() {
    if (typeof localStorage === "undefined") {
      return [DEFAULT_API_URL];
    }

    const storedValue = localStorage.getItem(STORAGE_KEY);

    if (!storedValue) {
      return [DEFAULT_API_URL];
    }

    try {
      const urls = JSON.parse(storedValue);
      const validUrls = Array.isArray(urls)
        ? urls.filter((url) => typeof url === "string" && url)
        : [];

      return validUrls.length > 0 ? validUrls : [DEFAULT_API_URL];
    } catch {
      return [storedValue];
    }
  }

  getSelectedApiUrl() {
    return this.selectedApiUrl;
  }

  async isHealthy(apiUrl) {
    if (typeof apiUrl !== "string" || !apiUrl.trim()) {
      return false;
    }

    try {
      await fetch(`${apiUrl.trim().replace(/\/+$/, "")}/health`);
      return true;
    } catch {
      return false;
    }
  }

  setApiUrl(value) {
    if (typeof value !== "string") {
      throw new Error("Informe uma URL válida para a API.");
    }

    const apiUrl = value.trim().replace(/\/+$/, "");

    if (!apiUrl) {
      throw new Error("Informe uma URL válida para a API.");
    }

    if (!this.apiUrl.includes(apiUrl)) {
      this.apiUrl = [...this.apiUrl, apiUrl];
    }
    this.selectedApiUrl = apiUrl;

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.apiUrl));
    }

    return apiUrl;
  }

  selectApiUrl(apiUrl) {
    if (!this.apiUrl.includes(apiUrl)) {
      throw new Error("A URL selecionada não está configurada.");
    }

    this.selectedApiUrl = apiUrl;
    return apiUrl;
  }

  removeApiUrl(apiUrl) {
    if (!this.apiUrl.includes(apiUrl)) {
      throw new Error("A URL selecionada não está configurada.");
    }

    this.apiUrl = this.apiUrl.filter((url) => url !== apiUrl);
    this.selectedApiUrl = this.apiUrl[0];

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.apiUrl));
    }

    return this.selectedApiUrl;
  }

  /**
   * Descobre todos os endereços IPv4 da rede local cuja API responde 200 a
   * GET em "/". Cada API encontrada é adicionada à lista e ao peers.csv
   * durante a busca.
   *
   * @param {string | string[]} [cidr] - Faixa(s) IPv4 em notação CIDR. Se
   *   omitido, varre a rede local (sub-rede detectada ou sub-redes comuns).
   * @param {(url: string) => void} [onFound] - Notifica a interface após atualizar a lista.
   * @returns {Promise<string[]>} URLs encontradas nesta busca.
   * @throws {Error} Se não for possível persistir uma descoberta, interrompe a busca.
   */
  async discoverApis(cidr, onFound) {
    return scanNetwork(cidr, {
      path: "/", // só entra na lista quem responde 200 a GET /
      onFound: async (apiUrl) => {
        if (!this.apiUrl.includes(apiUrl)) this.apiUrl.push(apiUrl);
        if (!this.apiUrl.includes(this.selectedApiUrl)) {
          this.selectedApiUrl = this.apiUrl[0];
        }
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.apiUrl));
        }
        onFound?.(apiUrl);
        const peersResponse = await fetch(
          `/api/peers.csv?url=${encodeURIComponent(apiUrl)}`,
          {
            method: "POST",
          },
        );
        if (peersResponse.status !== 204) {
          throw new Error(
            "API encontrada, mas não foi possível salvar em peers.csv.",
          );
        }
      },
    });
  }

  listFiles(...parameters) {
    return listFiles(this.getSelectedApiUrl(), ...parameters);
  }

  downloadFile(...parameters) {
    return downloadFile(this.getSelectedApiUrl(), ...parameters);
  }

  uploadFile(...parameters) {
    return uploadFile(this.getSelectedApiUrl(), ...parameters);
  }
}

export const api = new Api();
export default api;
