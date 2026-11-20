/*
 * Rotas da API:
 * GET /identity - retorna a identidade desta máquina.
 * POST /identity - altera somente o nome desta máquina, somente para o Vite local.
 * GET /peer - lista peers cadastrados, somente para o Vite local.
 * POST /peer - cadastra uma identidade descoberta ou atualiza seu IP.
 * DELETE /peer/:id - exclui um peer salvo, somente para o Vite local.
 * GET /dir e POST /dir - consultam e alteram SHARED_DIR, somente para o Vite local.
 * POST /files/upload - recebe { filename, mimeType, data } em JSON, com data em Base64.
 * GET /files/download/:path - recebe o caminho relativo codificado e retorna o arquivo em Base64.
 * GET /files/list/Faculdade%2FJaneiro - lista arquivos e pastas desse nível; sem path, lista a raiz.
 * Todas as rotas /files exigem X-Peer-Id com um id cadastrado em peers.csv.
 */
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import filesRoute from "./routes/files.js";
import peersRoute from "./routes/peers.js";
import dirRoute from "./routes/dir.js";
import identityRoute from "./routes/identity.js";
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
const peer = new Peer();
console.log(peer);

app.use(express.json({ limit: "134mb" }));
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Peer-Id"],
  }),
);
app.use("/identity", identityRoute(peer));
app.use("/peer", peersRoute(peer));
app.use("/dir", dirRoute());
app.get("/api", (_request, response) => {
  return response.sendFile(documentationPage);
});
app.use("/files", filesRoute(peer));
app.use((error, _request, response, _next) => {
  if (error.type === "entity.too.large") {
    return response
      .status(413)
      .json({ error: "Arquivo excede o limite de 100 MB." });
  }

  if ([400, 403, 409].includes(error.status)) {
    return response.status(error.status).json({ error: error.message });
  }

  console.error(error);
  return response.status(500).json({ error: "Erro interno do servidor." });
});

if (process.env.SHARED_DIR)
  await Directory.setSharedDir(process.env.SHARED_DIR);

app.listen(port, host, () => {
  console.log(`>>>API INICIADA<<<\nEscutando em ${host}:${port}`);
  console.log(`Este peer se chama: ${peer.nome ?? "(aguardando escolha do nome)"}`);
});

export default app;
