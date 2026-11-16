/*
 * Rotas da API:
 * GET / - retorna a identidade desta máquina.
 * POST /peer - cadastra uma identidade descoberta ou atualiza seu IP.
 * POST /files/upload - recebe { filename, mimeType, data } em JSON, com data em Base64.
 * GET /files/download/:filename - retorna o arquivo em Base64.
 * GET /files - lista os arquivos compartilhados.
 */
import express from "express";
import cors from "cors";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import downloadRoute from "./routes/download.js";
import listRoute from "./routes/list.js";
import uploadRoute from "./routes/upload.js";
import peersRoute from "./routes/peers.js";
import network from "../model/Network.js";
import Peer from "../model/Peer.js";

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || network.getIps()[0];
const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || "uploads");
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
    methods: ["GET", "POST", "OPTIONS"],
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
app.get("/api", (_request, response) => {
  return response.sendFile(documentationPage);
});
app.use("/files", uploadRoute(uploadDirectory));
app.use("/files", downloadRoute(uploadDirectory));
app.use("/files", listRoute(uploadDirectory));

app.use((error, request, response, next) => {
  if (error.type === "entity.too.large") {
    return response
      .status(413)
      .json({ error: "Arquivo excede o limite de 100 MB." });
  }

  console.error(error);
  return response.status(500).json({ error: "Erro interno do servidor." });
});

await mkdir(uploadDirectory, { recursive: true });

app.listen(port, host, () => {
  console.log(`>>>API INICIADA<<<\nEscutando em ${host}:${port}`);
  console.log(`Este peer se chama: ${peer.nome}`);
});

export default app;
