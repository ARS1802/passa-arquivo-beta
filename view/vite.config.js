import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import network from "../model/Network.js";

// Endereço usado diretamente pelo navegador para cadastrar peers na API local.
const localApiHost =
  process.env.HOST && process.env.HOST !== "0.0.0.0"
    ? process.env.HOST
    : network.getIps()[0] || "localhost";
const localApiUrl = `http://${localApiHost}:${process.env.PORT || 3000}`;
console.log(`VITE_PORT: ${network.vitePort}`);
console.log(`LOCAL_API_URL: ${localApiHost}`);
console.log(`LOCAL_NETWORK_CIDRS: ${network.cidrs}`);

// https://vite.dev/config/
export default defineConfig({
  // Insere uma cópia dos CIDRs no JavaScript enviado ao navegador.
  define: {
    "import.meta.env.VITE_PORT": JSON.stringify(String(network.vitePort)),
    "import.meta.env.LOCAL_NETWORK_CIDRS": JSON.stringify(network.cidrs),
    "import.meta.env.LOCAL_API_URL": JSON.stringify(localApiUrl),
  },
  plugins: [react()],
  // A rota GET /peer reconhece a interface local nesta porta.
  server: { port: network.vitePort, strictPort: true },
});
