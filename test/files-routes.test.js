import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import Directory from "../model/Directory.js";
import listRoute from "../controller/routes/list.js";
import downloadRoute from "../controller/routes/download.js";
import uploadRoute from "../controller/routes/upload.js";

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

  const app = express();
  app.use(express.json());
  app.use("/files", uploadRoute(), downloadRoute(), listRoute());
  app.use((error, _request, response, _next) => {
    response.status(error.status || 500).json({ error: error.message });
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/files`;
  const list = (directory = "") => fetch(`${base}?path=${encodeURIComponent(directory)}`);
  const download = (filePath) => fetch(`${base}/download/${encodeURIComponent(filePath)}`);

  await t.test("lista somente os arquivos e diretórios do nível solicitado", async () => {
    const root = await (await fetch(base)).json();
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
    assert.equal((await fetch(`${base}?path=Faculdade&path=Janeiro`)).status, 400);
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
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "novo.txt", data: "b2k=" }),
    });
    assert.equal(response.status, 201);
    assert.equal(await readFile(path.join(shared, "novo.txt"), "utf8"), "oi");
    await assert.rejects(readFile(path.join(shared, "Faculdade", "Janeiro", "novo.txt")), { code: "ENOENT" });
    assert.equal(process.env.SHARED_DIR, shared);
  });
});
