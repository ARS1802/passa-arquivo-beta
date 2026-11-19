import path from "node:path";
import { realpath, stat } from "node:fs/promises";

export default class Directory {
  constructor(name) {
    this.name = name;
  }

  static getSharedDir() {
    if (!process.env.SHARED_DIR) {
      throw Object.assign(new Error("Selecione um diretório para compartilhar."), { status: 409 });
    }
    return process.env.SHARED_DIR;
  }

  static async resolvePath(relativePath = "") {
    const sharedDirectory = this.getSharedDir();
    if (typeof relativePath !== "string" || relativePath.includes("\0") ||
        relativePath.includes("\\") || path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
      throw Object.assign(new TypeError("Informe um caminho relativo usando / entre as pastas."), { status: 400 });
    }
    // O cliente navega a partir da raiz compartilhada, sem subir por meio de "..".
    if (relativePath.split("/").includes("..")) {
      throw Object.assign(new Error("Acesso fora do diretório compartilhado."), { status: 403 });
    }

    const sharedRoot = await realpath(sharedDirectory);
    const resolved = await realpath(path.resolve(sharedRoot, relativePath));
    const relative = path.relative(sharedRoot, resolved);
    // realpath revela o destino dos links simbólicos; ele também deve ficar dentro da raiz.
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw Object.assign(new Error("Acesso fora do diretório compartilhado."), { status: 403 });
    }
    return resolved;
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
