import path from "node:path";
import { realpath, stat } from "node:fs/promises";

export default class Directory {
  static getSharedDir() {
    if (!process.env.SHARED_DIR) {
      throw Object.assign(new Error("Selecione um diretório para compartilhar."), { status: 409 });
    }
    return process.env.SHARED_DIR;
  }

  static async setSharedDir(directory) {
    if (typeof directory !== "string" || !path.isAbsolute(directory) || directory.includes("\0")) {
      throw new TypeError("Informe o caminho absoluto de um diretório.");
    }
    const resolved = await realpath(directory);
    if (!(await stat(resolved)).isDirectory()) {
      throw new TypeError("O caminho informado não é um diretório.");
    }
    // Só altera a pasta compartilhada depois de validar o caminho completo.
    process.env.SHARED_DIR = resolved;
    return resolved;
  }
}
