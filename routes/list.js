/*
 * Requisição esperada:
 * GET /files
 * Corpo: nenhum.
 *
 * Resposta:
 * { "files": ["documento.pdf", "imagem.png"] }
 */
import { readdir } from "node:fs/promises";
import { Router } from "express";

export default function listRoute(uploadDirectory) {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      const entries = await readdir(uploadDirectory, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);

      return response.json({ files });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
