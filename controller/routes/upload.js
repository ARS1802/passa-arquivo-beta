/*
 * Requisição esperada:
 * POST /files/upload
 * Body: { "filename": "documento.pdf", "mimeType": "application/pdf", "data": "<conteúdo em Base64>" }
 */
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import File from "../../model/File.js";

export default function uploadRoute(uploadDirectory) {
  const router = Router();

  router.post("/upload", async (request, response, next) => {
    const { filename, mimeType, data } = request.body || {};

    if (!File.isValidFilename(filename)) {
      return response.status(400).json({ error: "Nome de arquivo inválido." });
    }

    let file;

    try {
      file = File.fromBase64(filename, data, mimeType);
    } catch (error) {
      return response.status(400).json({ error: error.message });
    }

    if (file.size > File.MAX_FILE_SIZE) {
      return response
        .status(413)
        .json({ error: "Arquivo excede o limite de 100 MB." });
    }

    const destination = path.join(uploadDirectory, filename);

    try {
      await writeFile(destination, file.data, { flag: "wx" });
      return response.status(201).json({
        filename: file.filename,
        mimeType: file.mimeType,
        size: file.size,
        downloadUrl: `/files/download/${file.filename}`,
      });
    } catch (error) {
      if (error.code === "EEXIST") {
        return response.status(409).json({ error: "O arquivo já existe." });
      }

      await unlink(destination).catch(() => {});
      return next(error);
    }
  });

  return router;
}
