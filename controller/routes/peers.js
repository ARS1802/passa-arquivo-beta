import { Router } from "express";
import network from "../../model/Network.js";

export default function peersRoute(peer) {
  const router = Router();

  router.get("/", network.requireLocalVite, (request, response, next) => {
    try {
      return response.json({ peers: peer.getPeers() });
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/:id", network.requireLocalVite, (request, response, next) => {
    try {
      if (!peer.removePeer(request.params.id)) {
        return response.status(404).json({ error: "Peer não encontrado." });
      }
      return response.sendStatus(204);
    } catch (error) {
      if (error instanceof TypeError) {
        return response.status(400).json({ error: error.message });
      }
      return next(error);
    }
  });

  router.post("/", network.requireLocalVite, (request, response, next) => {
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
