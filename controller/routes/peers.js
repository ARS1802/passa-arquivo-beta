import { Router } from "express";
import network from "../../model/Network.js";

export default function peersRoute(peer) {
  const router = Router();

  //Apenas o Vite local pode obter os Peers salvos.
  router.get("/", (request, response, next) => {
    const localIps = ["127.0.0.1", "::1", ...network.getIps()];
    const origins = ["localhost", ...localIps].map(
      (host) => `http://${host === "::1" ? "[::1]" : host}:${network.vitePort}`,
    );
    // Usa a conexão real; cabeçalhos como X-Forwarded-For podem ser falsificados.
    const address = request.socket.remoteAddress?.replace(/^::ffff:/, "");
    const origin = request.get("Origin");
    response.set("Cache-Control", "no-store");
    response.vary("Origin");
    response.removeHeader("Access-Control-Allow-Origin");
    if (!localIps.includes(address) || !origins.includes(origin)) {
      return response
        .status(403)
        .json({ error: "Acesso permitido apenas ao Vite local." });
    }
    response.set("Access-Control-Allow-Origin", origin);
    try {
      return response.json({ peers: peer.getPeers() });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/", (request, response, next) => {
    try {
      peer.savePeer(request.body);
      return response.sendStatus(204);
    } catch (error) {
      if (error instanceof TypeError) {
        return response.status(400).json({ error: error.message });
      }
      return next(error);
    }
  });

  return router;
}
