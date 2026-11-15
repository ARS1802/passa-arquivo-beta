import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import network from "../model/Network.js";

// https://vite.dev/config/
export default defineConfig({
  // Insere uma cópia dos CIDRs no JavaScript enviado ao navegador.
  define: {
    "import.meta.env.LOCAL_NETWORK_CIDRS": JSON.stringify(network.cidrs),
  },
  plugins: [react()],
});
