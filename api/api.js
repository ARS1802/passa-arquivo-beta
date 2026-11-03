import { downloadFile } from "./download.js";
import { listFiles } from "./list.js";
import { uploadFile } from "./upload.js";

const STORAGE_KEY = "passa-arquivo-api-url";
const DEFAULT_API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

class Api {
  constructor() {
    this.apiUrl = this.readStoredApiUrl();
  }

  readStoredApiUrl() {
    if (typeof localStorage === "undefined") {
      return DEFAULT_API_URL;
    }

    return localStorage.getItem(STORAGE_KEY) || DEFAULT_API_URL;
  }

  getApiUrl() {
    return this.apiUrl;
  }

  setApiUrl(value) {
    if (typeof value !== "string") {
      throw new Error("Informe uma URL válida para a API.");
    }

    const apiUrl = value.trim().replace(/\/+$/, "");

    if (!apiUrl) {
      throw new Error("Informe uma URL válida para a API.");
    }

    this.apiUrl = apiUrl;

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, apiUrl);
    }

    return apiUrl;
  }

  listFiles(...parameters) {
    return listFiles(this.getApiUrl(), ...parameters);
  }

  downloadFile(...parameters) {
    return downloadFile(this.getApiUrl(), ...parameters);
  }

  uploadFile(...parameters) {
    return uploadFile(this.getApiUrl(), ...parameters);
  }
}

export const api = new Api();
export default api;