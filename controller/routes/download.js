/*
 * Requisição esperada:
 * GET /files/download/Faculdade%2FJaneiro%2Fdocumento.pdf
 * O parâmetro é o caminho relativo completo, codificado com encodeURIComponent.
 * Resposta: { "filename": "documento.pdf", "mimeType": "application/octet-stream", "data": "<conteúdo em Base64>", "size": 12345 }
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import File from "../../model/File.js";
import Directory from "../../model/Directory.js";

export default function downloadRoute() {
  const router = Router();

  router.get("/download/:path", async (request, response, next) => {
    try {
      const filePath = await Directory.resolvePath(request.params.path);
      if (!(await stat(filePath)).isFile()) {
        return response.status(400).json({ error: "O caminho informado não é um arquivo." });
      }
      const file = new File(path.basename(request.params.path), await readFile(filePath));
      return response.json({
        filename: file.filename,
        mimeType: file.mimeType,
        data: file.toBase64(),
        size: file.size,
      });
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        return response.status(404).json({ error: "Arquivo não encontrado." });
      }
      if (error.code === "EACCES" || error.code === "EPERM") {
        return response.status(403).json({ error: "Sem permissão para acessar o arquivo." });
      }

      return next(error);
    }
  });

  return router;
}
