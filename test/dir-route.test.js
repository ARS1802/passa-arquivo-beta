import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import cors from "cors";
import dirRoute from "../controller/routes/dir.js";
import listRoute from "../controller/routes/list.js";
import uploadRoute from "../controller/routes/upload.js";
import downloadRoute from "../controller/routes/download.js";
import Directory from "../model/Directory.js";
import network from "../model/Network.js";

test("diretório compartilhado é validado, exclusivo do Vite local e atualizado sem reiniciar", async (t) => {
  const previousDirectory = process.env.SHARED_DIR;
  delete process.env.SHARED_DIR;
  const temporary = await mkdtemp(path.join(os.tmpdir(), "passa-arquivo-"));
  const first = path.join(temporary, "Primeira pasta");
  const second = path.join(temporary, "Segunda pasta");
  await mkdir(first);
  await mkdir(second);
  await writeFile(path.join(first, "primeiro.txt"), "primeiro");
  await writeFile(path.join(second, "segundo.txt"), "segundo");
  t.after(async () => {
    if (previousDirectory === undefined) delete process.env.SHARED_DIR;
    else process.env.SHARED_DIR = previousDirectory;
    await rm(temporary, { recursive: true, force: true });
  });
  t.mock.method(network, "getIps", () => ["192.168.1.10"]);
  let address = "127.0.0.1";
  let picked = first;
  let pickerCalls = 0;
  t.mock.method(Directory, "selectDirectory", async () => {
    pickerCalls++;
    return picked;
  });
  const app = express();
  app.use(express.json());
  app.use(cors());
  app.use((request, _response, next) => {
    Object.defineProperty(request.socket, "remoteAddress", { value: address, configurable: true });
    next();
  });
  app.use("/dir", dirRoute());
  app.use("/files", uploadRoute(), downloadRoute(), listRoute());
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const origin = `http://localhost:${network.vitePort}`;
  const headers = { Origin: origin, "Content-Type": "application/json" };
  const update = (directory) => fetch(`${base}/dir`, {
    method: "POST", headers, body: JSON.stringify({ SHARED_DIR: directory }),
  });
  const upload = () => fetch(`${base}/files/upload`, {
    method: "POST", headers, body: JSON.stringify({ filename: "novo.txt", data: "b2k=" }),
  });

  assert.deepEqual(await (await fetch(`${base}/dir`, { headers })).json(), { SHARED_DIR: null });
  assert.equal((await fetch(`${base}/files`)).status, 409);
  assert.equal((await fetch(`${base}/files/download/primeiro.txt`)).status, 409);
  assert.equal((await upload()).status, 409);

  await t.test("rejeita origem ou conexão remotas antes de abrir o picker ou alterar a pasta", async () => {
    for (const [remoteAddress, requestOrigin] of [
      ["127.0.0.1", undefined],
      ["127.0.0.1", `http://localhost:${network.vitePort + 1}`],
      ["127.0.0.1", `http://192.168.1.99:${network.vitePort}`],
      ["::ffff:192.168.1.99", origin],
    ]) {
      address = remoteAddress;
      for (const [route, method] of [["/dir", "GET"], ["/dir", "POST"], ["/dir/picker", "POST"]]) {
        const response = await fetch(`${base}${route}`, {
          method,
          headers: { "X-Forwarded-For": "127.0.0.1", ...(requestOrigin ? { Origin: requestOrigin } : {}) },
        });
        assert.equal(response.status, 403);
        assert.equal(response.headers.get("access-control-allow-origin"), null);
      }
    }
    assert.equal(pickerCalls, 0);
    assert.equal(process.env.SHARED_DIR, undefined);
    address = "::ffff:192.168.1.10";
  });

  await t.test("picker retorna caminho ou cancelamento, sem compartilhar por conta própria", async () => {
    const response = await fetch(`${base}/dir/picker`, { method: "POST", headers });
    assert.deepEqual(await response.json(), { SHARED_DIR: first });
    assert.equal(process.env.SHARED_DIR, undefined);
    picked = null;
    assert.equal((await fetch(`${base}/dir/picker`, { method: "POST", headers })).status, 204);
  });

  const response = await update(first);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { SHARED_DIR: first });
  assert.equal(process.env.SHARED_DIR, first);

  await t.test("dados inválidos, caminho ausente ou arquivo preservam o diretório anterior", async () => {
    for (const [directory, status] of [
      [undefined, 400], [null, 400], [12, 400], ["", 400], ["relativo", 400],
      [`${first}\0`, 400], [path.join(temporary, "ausente"), 404],
      [path.join(first, "primeiro.txt"), 400],
    ]) {
      assert.equal((await update(directory)).status, status);
      assert.equal(process.env.SHARED_DIR, first);
    }
  });

  assert.deepEqual((await (await fetch(`${base}/files`)).json()).files.map((file) => file.filename), ["primeiro.txt"]);
  assert.equal((await update(second)).status, 200);
  assert.deepEqual((await (await fetch(`${base}/files`)).json()).files.map((file) => file.filename), ["segundo.txt"]);
  assert.equal((await fetch(`${base}/files/download/primeiro.txt`)).status, 404);
  assert.equal((await (await fetch(`${base}/files/download/segundo.txt`)).json()).data, Buffer.from("segundo").toString("base64"));
  assert.equal((await upload()).status, 201);
  assert.equal(await readFile(path.join(second, "novo.txt"), "utf8"), "oi");
  await assert.rejects(readFile(path.join(first, "novo.txt")), { code: "ENOENT" });
  assert.equal((await upload()).status, 409);

  // Uma pasta escolhida por link é salva com seu caminho real.
  const link = path.join(temporary, "atalho");
  await symlink(second, link);
  assert.deepEqual(await (await update(link)).json(), { SHARED_DIR: second });
  assert.equal(process.env.SHARED_DIR, second);
});

test("seletor nativo preserva espaços e distingue seleção, cancelamento e falha", { skip: process.platform !== "linux" }, async (t) => {
  const previous = Object.fromEntries(["PATH", "DISPLAY", "WAYLAND_DISPLAY"].map((key) => [key, process.env[key]]));
  const temporary = await mkdtemp(path.join(os.tmpdir(), "passa-picker-"));
  t.after(async () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(temporary, { recursive: true, force: true });
  });
  // Executável de teste: exercita a chamada ao sistema sem abrir janelas reais.
  process.env.PATH = temporary;
  process.env.DISPLAY = ":teste";
  const executable = path.join(temporary, "zenity");
  await writeFile(executable, `#!/bin/sh
test "$1" = "--file-selection" && test "$2" = "--directory" || exit 2
printf '%s\\n' '/tmp/Pasta com espaços '
`, { mode: 0o700 });
  assert.equal(await Directory.selectDirectory(), "/tmp/Pasta com espaços ");
  await writeFile(executable, "#!/bin/sh\nexit 1\n");
  assert.equal(await Directory.selectDirectory(), null);
  await writeFile(executable, "#!/bin/sh\nprintf 'Falha no display' >&2\nexit 1\n");
  await assert.rejects(Directory.selectDirectory(), { status: 503 });
  await rm(executable);
  await assert.rejects(Directory.selectDirectory(), { status: 503 });
  delete process.env.DISPLAY;
  delete process.env.WAYLAND_DISPLAY;
  await assert.rejects(Directory.selectDirectory(), { status: 503 });
});
