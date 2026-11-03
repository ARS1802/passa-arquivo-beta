/*
 * Requisição esperada:
 * POST /files/upload?filename=documento.pdf
 * Headers: Content-Length: 12345
 * Body: conteúdo binário do arquivo (não é JSON).
 *
 *  Obs: Content-Length é em bytes
 */
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import { isValidFilename, MAX_FILE_SIZE } from "../utils/file-utils.js";

export default function uploadRoute(uploadDirectory) {
  const router = Router();

  router.post("/upload", async (request, response, next) => {
    //POST /files/upload?filename=documento.pdf
    //request.query.filename
    const filename = request.query.filename || request.get("x-file-name");

    if (!isValidFilename(filename)) {
      return response.status(400).json({
        error:
          "Informe um nome de arquivo válido em ?filename= ou no header x-file-name.",
      });
    }

    const destination = path.join(uploadDirectory, filename);
    const fileSize = Number(request.get("content-length"));

    if (!Number.isInteger(fileSize) || fileSize < 0) {
      return response.status(400).json({
        error: "O header Content-Length é obrigatório e deve ser válido.",
      });
    }

    if (fileSize > MAX_FILE_SIZE) {
      return response
        .status(413)
        .json({ error: "Arquivo excede o limite de 100 MB." });
    }

    //w: abre o arquivo para escrita; se ele existir, normalmente seria sobrescrito.
    //x: exige que o arquivo ainda não exista; caso exista, ocorre erro EEXIST.
    const output = createWriteStream(destination, { flags: "wx" });

    try {
      await pipeline(request, output);
      return response.status(201).json({
        filename,
        size: fileSize,
        downloadUrl: `/files/download/${encodeURIComponent(filename)}`,
      });
    } catch (error) {
      await unlink(destination).catch(() => {});

      if (error.code === "EEXIST") {
        return response.status(409).json({ error: "O arquivo já existe." });
      }

      return next(error);
    }
  });

  return router;
}
