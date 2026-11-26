import { Router } from "express";
import network from "../../model/Network.js";
import Security from "../../model/Security.js";
import { validatePublicIdentity, validatePeer } from "../../model/Peer.js";

export default function keyRoute(peer) {
  const router = Router();

  router.post("/", (request, response, next) => {
    response.set("Cache-Control", "no-store");
    try {
      const body = request.body;
      validatePublicIdentity({ nome: body?.nome, ip: body?.ip, publicKey: body?.pubKey });
      if (!peer.nome) {
        return response.status(409).json({ error: "O dispositivo ainda não possui nome." });
      }
      return response.json({
        nome: peer.nome,
        ip: peer.ip,
        pubKey: peer.publicKey,
        id: Security.crypt(body.pubKey, peer.id),
      });
    } catch (error) {
      if (error instanceof TypeError) {
        return response.status(400).json({ error: error.message });
      }
      return next(error);
    }
  });

  // Os fetchers rodam no navegador; a chave privada fica somente no backend local.
  router.post("/decrypt", network.requireLocalVite, (request, response) => {
    try {
      const body = request.body;
      const identity = { nome: body?.nome, ip: body?.ip, publicKey: body?.pubKey };
      validatePublicIdentity(identity);
      identity.id = Security.decrypt(Security.privateKey, body?.id);
      validatePeer(identity);
      return response.json(identity);
    } catch {
      return response.status(400).json({ error: "A identidade recebida é inválida ou não pode ser descriptografada." });
    }
  });

  return router;
}
