/*
 * Requisição esperada:
 * GET /files/list/Faculdade%2FJaneiro (/files/list/ lista a raiz compartilhada)
 * Corpo: nenhum.
 *
 * Resposta:
 * { "files": [{ "filename": "documento.pdf", "mimeType": "application/octet-stream", "size": 12345, "lastModified": "..." }], "directories": [{ "name": "Trabalhos" }] }
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import File from "../../model/File.js";
import Directory from "../../model/Directory.js";

export default function listRoute() {
  const router = Router();

  router.get("/list{/:path}", async (request, response, next) => {
    try {
      const directoryPath = await Directory.resolvePath(request.params.path);
      const entries = await readdir(directoryPath, { withFileTypes: true });
      const directories = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => new Directory(entry.name));
      const files = await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const filePath = path.join(directoryPath, entry.name);
            const [data, metadata] = await Promise.all([
              readFile(filePath),
              stat(filePath),
            ]);
            const file = new File(entry.name, data);

            file.lastModified = metadata.mtime.toISOString();
            return file;
          }),
      );

      return response.json({
        directories,
        files: files.map((file) => ({
          filename: file.filename,
          mimeType: file.mimeType,
          size: file.size,
          lastModified: file.lastModified,
        })),
      });
    } catch (error) {
      if (error.code === "ENOENT") {
        return response.status(404).json({ error: "Diretório não encontrado." });
      }
      if (error.code === "ENOTDIR") {
        return response.status(400).json({ error: "O caminho informado não é um diretório." });
      }
      if (error.code === "EACCES" || error.code === "EPERM") {
        return response.status(403).json({ error: "Sem permissão para acessar o diretório." });
      }
      return next(error);
    }
  });

  return router;
}
