import { Router } from "express";
import Directory from "../../model/Directory.js";
import network from "../../model/Network.js";

export default function dirRoute() {
  const router = Router();
  router.use(network.requireLocalVite);

  router.get("/", (_request, response) => {
    return response.json({ SHARED_DIR: process.env.SHARED_DIR || null });
  });

  // Escolher uma pasta não a compartilha; a GUI confirma o caminho em POST /dir.
  router.post("/picker", async (_request, response) => {
    const directory = await Directory.selectDirectory();
    if (directory === null) return response.sendStatus(204);
    return response.json({ SHARED_DIR: directory });
  });

  router.post("/", async (request, response, next) => {
    try {
      const directory = await Directory.setSharedDir(request.body?.SHARED_DIR);
      return response.json({ SHARED_DIR: directory });
    } catch (error) {
      if (error instanceof TypeError || error.code === "ENOTDIR") {
        return response.status(400).json({ error: error.message });
      }
      if (error.code === "ENOENT") {
        return response.status(404).json({ error: "Diretório não encontrado." });
      }
      if (error.code === "EACCES" || error.code === "EPERM") {
        return response.status(403).json({ error: "Sem permissão para acessar o diretório." });
      }
      return next(error);
    }
  });

  return router;
}
