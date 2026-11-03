import { Router } from "express";
import downloadRoute from "./download.js";
import uploadRoute from "./upload.js";

export default function fileRoutes(uploadDirectory) {
  const router = Router();

  router.use(uploadRoute(uploadDirectory));
  router.use(downloadRoute(uploadDirectory));

  return router;
}
