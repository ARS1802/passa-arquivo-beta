import { Router } from "express";
import keyRoute from "./key.js";
import network from "../../model/Network.js";

export default function identityRoute(peer) {
  const router = Router();

  router.use("/key", keyRoute(peer));

  router.get("/", network.requireLocalVite, (_request, response) => {
    response.set("Cache-Control", "no-store");
    return response.json(peer);
  });

  router.post("/", network.requireLocalVite, (request, response, next) => {
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !Object.hasOwn(body, "nome")) {
      return response.status(400).json({ error: "Informe somente o campo nome." });
    }
    try {
      peer.nome = body.nome;
      return response.json(peer);
    } catch (error) {
      if (error instanceof TypeError) {
        return response.status(400).json({ error: error.message });
      }
      return next(error);
    }
  });

  return router;
}
