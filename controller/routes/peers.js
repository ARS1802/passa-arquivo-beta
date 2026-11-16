import { Router } from "express";

export default function peersRoute(peer) {
  const router = Router();

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
