import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { appendFileSync, readFileSync } from "node:fs";
import { isIPv4 } from "node:net";
import path from "node:path";
import network from "../model/Network.js";

/**
 * Recebe cada descoberta da GUI e acrescenta sua URL ao CSV, sem duplicatas.
 * @param {import('vite').ViteDevServer | import('vite').PreviewServer} server - Servidor local da GUI.
 */
function configurePeers(server) {
  const peersFile = path.resolve(server.config.root, "../controller/fetchers/peers.csv");
  server.middlewares.use((request, response, next) => {
    const requestUrl = new URL(request.url, "http://localhost");
    if (requestUrl.pathname !== "/api/peers.csv" || request.method !== "POST")
      return next();

    let peer;
    try {
      if (
        request.headers.origin &&
        new URL(request.headers.origin).host !== request.headers.host
      ) {
        response.writeHead(403).end();
        return;
      }
      peer = new URL(requestUrl.searchParams.get("url"));
      if (
        peer.protocol !== "http:" ||
        !isIPv4(peer.hostname) ||
        peer.href !== `${peer.origin}/`
      ) {
        response.writeHead(400).end("URL inválida.");
        return;
      }
    } catch {
      response.writeHead(400).end("URL inválida.");
      return;
    }

    try {
      const csv = readFileSync(peersFile, "utf8");
      if (!csv.split(/\r?\n/).includes(peer.origin)) {
        appendFileSync(
          peersFile,
          `${csv.endsWith("\n") ? "" : "\n"}${peer.origin}\n`,
        );
      }
      response.writeHead(204).end();
    } catch {
      response.writeHead(500).end("Não foi possível salvar em peers.csv.");
    }
  });
}

// https://vite.dev/config/
export default defineConfig({
  // Insere uma cópia dos CIDRs no JavaScript enviado ao navegador.
  define: {
    "import.meta.env.LOCAL_NETWORK_CIDRS": JSON.stringify(network.cidrs),
  },
  plugins: [
    react(),
    {
      name: "peers-csv",
      configureServer: configurePeers,
      configurePreviewServer: configurePeers,
    },
  ],
});
