import express from "express";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import downloadRoute from "./routes/download.js";
import uploadRoute from "./routes/upload.js";
import errorHandler from "./utils/error-handler.js";

const app = express();
const port = process.env.PORT || 3000;
const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || "uploads");

app.use(express.json());
app.use("/files", uploadRoute(uploadDirectory));
app.use("/files", downloadRoute(uploadDirectory));

app.use(errorHandler);

await mkdir(uploadDirectory, { recursive: true });

app.listen(port, () => {
  console.log(`Servidor ouvindo na porta ${port}`);
});

export default app;
