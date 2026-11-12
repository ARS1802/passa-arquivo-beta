/*
 * Requisição esperada:
 * GET /files/download/documento.pdf
 * Resposta: { "filename": "documento.pdf", "mimeType": "application/octet-stream", "data": "<conteúdo em Base64>", "size": 12345 }
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import File from "../../model/File.js";

export default function downloadRoute(uploadDirectory) {
  const router = Router();

  router.get("/download/:filename", async (request, response, next) => {
    const { filename } = request.params;

    if (!File.isValidFilename(filename)) {
      return response.status(400).json({ error: "Nome de arquivo inválido." });
    }

    const filePath = path.join(uploadDirectory, filename);

    try {
      const file = new File(filename, await readFile(filePath));
      return response.json({
        filename: file.filename,
        mimeType: file.mimeType,
        data: file.toBase64(),
        size: file.size,
      });
    } catch (error) {
      if (error.code === "ENOENT") {
        return response.status(404).json({ error: "Arquivo não encontrado." });
      }

      return next(error);
    }
  });

  return router;
}
