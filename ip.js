import os from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const cidrs = Object.values(os.networkInterfaces())
  .flatMap((addresses) => addresses ?? [])
  .filter(
    (address) =>
      (address.family === "IPv4" || address.family === 4) &&
      !address.internal &&
      address.cidr,
  )
  .map((address) => address.cidr);

mkdirSync("public", { recursive: true });
writeFileSync(
  "public/local-network.json",
  `${JSON.stringify({ cidrs }, null, 2)}\n`,
);

console.log(
  cidrs.length > 0
    ? `Sub-redes locais: ${cidrs.join(", ")}`
    : "Nenhuma sub-rede IPv4 local encontrada.",
);