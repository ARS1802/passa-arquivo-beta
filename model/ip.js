import os from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";

// Resolve os caminhos pela localização do arquivo, independentemente do terminal.
const publicDirectory = new URL("../view/public/", import.meta.url);
dotenv.config({ path: new URL("../view/.env.local", import.meta.url) });

const cidrs = Object.values(os.networkInterfaces())
  .flatMap((addresses) => addresses ?? [])
  .filter(
    (address) =>
      (address.family === "IPv4" || address.family === 4) &&
      !address.internal &&
      address.cidr,
  )
  .map((address) => address.cidr);

mkdirSync(publicDirectory, { recursive: true });
writeFileSync(
  new URL("local-network.json", publicDirectory),
  `${JSON.stringify({ cidrs }, null, 2)}\n`,
);

console.log(
  cidrs.length > 0
    ? `Sub-redes locais: ${cidrs.join(", ")}`
    : "Nenhuma sub-rede IPv4 local encontrada.",
);