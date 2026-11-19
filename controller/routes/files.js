import { Router } from "express";
import uploadRoute from "./upload.js";
import downloadRoute from "./download.js";
import listRoute from "./list.js";

export default function filesRoute(peer) {
  const router = Router();

  router.use(async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (!await peer.isRegistered(request.get("X-Peer-Id"))) {
      return response.status(403).json({ error: "Acesso permitido apenas a peers cadastrados." });
    }
    return next();
  });

  router.use(uploadRoute(), downloadRoute(), listRoute());
  return router;
}
