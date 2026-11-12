/*
 * Requisição esperada:
 * GET /files
 * Corpo: nenhum.
 *
 * Resposta:
 * { "files": [{ "filename": "documento.pdf", "size": 12345, "lastModified": "..." }] }
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import File from "../../model/File.js";

export default function listRoute(uploadDirectory) {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      const entries = await readdir(uploadDirectory, { withFileTypes: true });
      const files = await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const filePath = path.join(uploadDirectory, entry.name);
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
        files: files.map((file) => ({
          filename: file.filename,
          mimeType: file.mimeType,
          size: file.size,
          lastModified: file.lastModified,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
