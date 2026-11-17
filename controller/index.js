/*
 * Rotas da API:
 * GET / - retorna a identidade desta máquina.
 * GET /peer - lista peers cadastrados, somente para o Vite local.
 * POST /peer - cadastra uma identidade descoberta ou atualiza seu IP.
 * DELETE /peer/:id - exclui um peer salvo, somente para o Vite local.
 * GET /dir e POST /dir - consultam e alteram SHARED_DIR, somente para o Vite local.
 * POST /dir/picker - abre o seletor nativo na máquina da API.
 * POST /files/upload - recebe { filename, mimeType, data } em JSON, com data em Base64.
 * GET /files/download/:filename - retorna o arquivo em Base64.
 * GET /files - lista os arquivos compartilhados.
 */
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import downloadRoute from "./routes/download.js";
import listRoute from "./routes/list.js";
import uploadRoute from "./routes/upload.js";
import peersRoute from "./routes/peers.js";
import dirRoute from "./routes/dir.js";
import network from "../model/Network.js";
import Peer from "../model/Peer.js";
import Directory from "../model/Directory.js";

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || network.getIps()[0];
const documentationPage = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../view/pages/index.html",
);
const peer = new Peer("megaman");
console.log(peer);

app.use(express.json({ limit: "134mb" }));
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.get("/", (_request, response) => {
  response.set("Cache-Control", "no-store");
  return response.sendFile(
    fileURLToPath(new URL("../model/identity.json", import.meta.url)),
  );
});
app.use("/peer", peersRoute(peer));
app.use("/dir", dirRoute());
app.get("/api", (_request, response) => {
  return response.sendFile(documentationPage);
});
app.use("/files", uploadRoute());
app.use("/files", downloadRoute());
app.use("/files", listRoute());

app.use((error, request, response, next) => {
  if (error.type === "entity.too.large") {
    return response
      .status(413)
      .json({ error: "Arquivo excede o limite de 100 MB." });
  }

  if (error.status === 409 || error.status === 503) {
    return response.status(error.status).json({ error: error.message });
  }

  console.error(error);
  return response.status(500).json({ error: "Erro interno do servidor." });
});

if (process.env.SHARED_DIR) await Directory.setSharedDir(process.env.SHARED_DIR);

app.listen(port, host, () => {
  console.log(`>>>API INICIADA<<<\nEscutando em ${host}:${port}`);
  console.log(`Este peer se chama: ${peer.nome}`);
});

export default app;
