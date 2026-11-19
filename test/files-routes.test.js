import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import express from "express";
import Directory from "../model/Directory.js";
import network from "../model/Network.js";
import filesRoute from "../controller/routes/files.js";

test("navega e baixa por caminhos relativos, mantendo o acesso dentro da pasta compartilhada", async (t) => {
  const previousDirectory = process.env.SHARED_DIR;
  const temporary = await mkdtemp(path.join(os.tmpdir(), "passa-arquivo-subdiretorios-"));
  const shared = path.join(temporary, "Documentos");
  const outside = path.join(temporary, "Documentos-privados");
  const specialName = "Revisão & notas #1%.txt";
  await mkdir(path.join(shared, "Faculdade", "Janeiro"), { recursive: true });
  await mkdir(path.join(shared, "Faculdade", "Fevereiro"));
  await mkdir(outside);
  await writeFile(path.join(shared, "raiz.txt"), "raiz");
  await writeFile(path.join(shared, "Faculdade", "Janeiro", specialName), "anotações");
  await writeFile(path.join(outside, "segredo.txt"), "privado");
  await symlink(outside, path.join(shared, "atalho-externo"), "dir");
  await symlink(path.join(outside, "segredo.txt"), path.join(shared, "externo.txt"));
  await Directory.setSharedDir(shared);
  t.after(async () => {
    if (previousDirectory === undefined) delete process.env.SHARED_DIR;
    else process.env.SHARED_DIR = previousDirectory;
    await rm(temporary, { recursive: true, force: true });
  });

  // Usa o Model real com arquivos temporários para testar autorização e revogação.
  t.mock.method(network, "obtainCidrs", () => {});
  t.mock.method(network, "getIps", () => ["192.168.1.10"]);
  const source = (await readFile(new URL("../model/Peer.js", import.meta.url), "utf8"))
    .replace('"./Network.js"', JSON.stringify(new URL("../model/Network.js", import.meta.url).href))
    .replace('"../controller/peers.csv"', '"./peers.csv"');
  const moduleUrl = pathToFileURL(path.join(temporary, "Peer.mjs"));
  await writeFile(moduleUrl, source);
  const { default: Peer } = await import(moduleUrl.href);
  const peer = new Peer("MeuPC");
  const headers = { "X-Peer-Id": peer.id };
  const app = express();
  app.use(express.json());
  app.use("/files", filesRoute(peer));
  app.use((error, _request, response, _next) => {
    response.status(error.status || 500).json({ error: error.message });
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/files`;
  const list = (directory = "") => fetch(`${base}/list/${encodeURIComponent(directory)}`, { headers });
  const download = (filePath) => fetch(`${base}/download/${encodeURIComponent(filePath)}`, { headers });

  await t.test("rejeita requisições sem id ou com id desconhecido antes de acessar arquivos", async () => {
    for (const id of [undefined, "inválido", "6d895d28-3105-4ab0-902a-2bb6e6bc7d65"]) {
      const headers = id ? { "X-Peer-Id": id } : {};
      assert.equal((await fetch(`${base}/list/`, { headers })).status, 403);
      assert.equal((await fetch(`${base}/download/raiz.txt`, { headers })).status, 403);
      const response = await fetch(`${base}/upload`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "negado.txt", data: "b2k=" }),
      });
      assert.equal(response.status, 403);
    }
    await assert.rejects(readFile(path.join(shared, "negado.txt")), { code: "ENOENT" });
  });

  await t.test("lista somente os arquivos e diretórios do nível solicitado", async () => {
    const root = await (await list()).json();
    assert.deepEqual(root.directories, [{ name: "Faculdade" }]);
    assert.deepEqual(root.files.map((file) => file.filename), ["raiz.txt"]);
    assert.equal(root.files[0].size, 4);
    assert.equal(root.files[0].mimeType, "application/octet-stream");
    assert.ok(Number.isFinite(Date.parse(root.files[0].lastModified)));
    assert.deepEqual(await (await list("Faculdade")).json(), {
      files: [], directories: [{ name: "Fevereiro" }, { name: "Janeiro" }],
    });
    const january = await (await list("Faculdade/Janeiro")).json();
    assert.deepEqual(january.directories, []);
    assert.deepEqual(january.files.map((file) => file.filename), [specialName]);
    assert.deepEqual(await (await list("Faculdade/Fevereiro")).json(), { files: [], directories: [] });
  });

  await t.test("Directory resolve a raiz e os caminhos de pastas e arquivos", async () => {
    assert.equal(await Directory.resolvePath(), shared);
    assert.equal(await Directory.resolvePath("Faculdade/Janeiro"), path.join(shared, "Faculdade", "Janeiro"));
    assert.equal(await Directory.resolvePath("raiz.txt"), path.join(shared, "raiz.txt"));
    for (const invalid of [null, 12, [], {}, "\0", shared, "C:\\privado", "..\\privado"]) {
      await assert.rejects(Directory.resolvePath(invalid), { status: 400 });
    }
  });

  await t.test("baixa arquivos aninhados com espaços, acentos e caracteres de URL", async () => {
    const response = await download(`Faculdade/Janeiro/${specialName}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      filename: specialName, mimeType: "application/octet-stream",
      data: Buffer.from("anotações").toString("base64"), size: Buffer.byteLength("anotações"),
    });
    assert.equal((await download("raiz.txt")).status, 200);
  });

  await t.test("rejeita travessia, caminhos absolutos e links para fora da raiz", async () => {
    for (const relativePath of ["../Documentos-privados", "Faculdade/../../Documentos-privados", "atalho-externo"]) {
      assert.equal((await list(relativePath)).status, 403, relativePath);
      assert.equal((await download(`${relativePath}/segredo.txt`)).status, 403, relativePath);
    }
    assert.equal((await download("externo.txt")).status, 403);
    for (const relativePath of [outside, "C:\\privado", "..\\privado", "\0"]) {
      assert.equal((await list(relativePath)).status, 400, relativePath);
      assert.equal((await download(relativePath)).status, 400, relativePath);
    }
  });

  await t.test("distingue caminho inexistente, arquivo e diretório", async () => {
    assert.equal((await list("ausente")).status, 404);
    assert.equal((await download("Faculdade/ausente.txt")).status, 404);
    assert.equal((await list("raiz.txt")).status, 400);
    assert.equal((await download("Faculdade")).status, 400);
  });

  await t.test("upload continua na raiz mesmo depois de navegar", async () => {
    await list("Faculdade/Janeiro");
    const response = await fetch(`${base}/upload`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "novo.txt", data: "b2k=" }),
    });
    assert.equal(response.status, 201);
    assert.equal(await readFile(path.join(shared, "novo.txt"), "utf8"), "oi");
    await assert.rejects(readFile(path.join(shared, "Faculdade", "Janeiro", "novo.txt")), { code: "ENOENT" });
    assert.equal(process.env.SHARED_DIR, shared);
  });

  await t.test("autoriza peer cadastrado por id e bloqueia as três rotas após a remoção", async () => {
    const remote = { nome: "OutroPC", ip: "192.168.1.20", id: "e3743d67-6215-4b5d-a67c-31a45ee4f60a" };
    peer.appendPeer(remote);
    const remoteHeaders = { "X-Peer-Id": remote.id };
    const send = () => fetch(`${base}/upload`, {
      method: "POST", headers: { ...remoteHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "remoto.txt", data: "b2k=" }),
    });
    assert.equal((await fetch(`${base}/list/`, { headers: remoteHeaders })).status, 200);
    assert.equal((await fetch(`${base}/download/raiz.txt`, { headers: remoteHeaders })).status, 200);
    assert.equal((await send()).status, 201);
    assert.equal(peer.removePeer(remote.id), true);
    assert.equal((await fetch(`${base}/list/`, { headers: remoteHeaders })).status, 403);
    assert.equal((await fetch(`${base}/download/raiz.txt`, { headers: remoteHeaders })).status, 403);
    assert.equal((await send()).status, 403);
  });

  await t.test("não libera arquivos quando o cadastro está ausente ou ilegível", async () => {
    const peersFile = path.join(temporary, "peers.csv");
    await rm(peersFile);
    assert.equal((await list()).status, 403);
    await mkdir(peersFile);
    assert.equal((await list()).status, 500);
  });
});
