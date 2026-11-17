import path from "node:path";
import { realpath, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

  static async selectDirectory() {
    // O navegador não revela o caminho absoluto; o diálogo precisa rodar na API local.
    if (process.platform !== "linux" || (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)) {
      throw Object.assign(new Error("O seletor requer Linux com uma sessão gráfica ativa."), { status: 503 });
    }
    try {
      const { stdout } = await execFileAsync("zenity", [
        "--file-selection", "--directory", "--title=Escolha o diretório para compartilhar",
      ]);
      // Remove somente a quebra adicionada pelo Zenity, preservando espaços no nome.
      return stdout.replace(/\n$/, "") || null;
    } catch (error) {
      if (error.code === 1 && !error.stderr?.trim()) return null;
      throw Object.assign(new Error("Não foi possível abrir o seletor. Verifique o Zenity e a sessão gráfica da API."), { status: 503 });
    }
  }
}
