/*
 * Requisição esperada:
 * GET /files/download/documento.pdf
 */
import { access } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { isValidFilename } from "../utils/file-utils.js";

export default function downloadRoute(uploadDirectory) {
  const router = Router();

  router.get("/download/:filename", async (request, response, next) => {
    const { filename } = request.params;

    if (!isValidFilename(filename)) {
      return response.status(400).json({ error: "Nome de arquivo inválido." });
    }

    const filePath = path.join(uploadDirectory, filename);

    try {
      await access(filePath);
      return response.download(filePath, filename, (error) => {
        if (error && !response.headersSent) {
          next(error);
        }
      });
    } catch {
      return response.status(404).json({ error: "Arquivo não encontrado." });
    }
  });

  return router;
}
