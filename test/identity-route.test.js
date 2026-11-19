import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import express from "express";
import cors from "cors";
import identityRoute from "../controller/routes/identity.js";
import network from "../model/Network.js";

async function isolatedPeer(t, identity, csv) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "passa-arquivo-identity-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  t.mock.method(network, "obtainCidrs", () => {});
  t.mock.method(network, "getIps", () => ["192.168.1.10"]);
  // Copia o Model para testar a persistência sem tocar na identidade do desenvolvedor.
  const source = (await readFile(new URL("../model/Peer.js", import.meta.url), "utf8"))
    .replace('"./Network.js"', JSON.stringify(new URL("../model/Network.js", import.meta.url).href))
    .replace('"../controller/peers.csv"', '"./peers.csv"');
  const moduleUrl = pathToFileURL(path.join(directory, "Peer.mjs"));
  const file = path.join(directory, "identity.json");
  const peersFile = path.join(directory, "peers.csv");
  await writeFile(moduleUrl, source);
  if (identity !== undefined) await writeFile(file, JSON.stringify(identity));
  if (csv !== undefined) await writeFile(peersFile, csv);
  const { default: Peer } = await import(moduleUrl.href);
  return { Peer, file, peersFile, moduleUrl };
}

test("Peer inicia sem nome, relê o JSON e persiste somente a mudança de nome", async (t) => {
  const { Peer, file, moduleUrl } = await isolatedPeer(t);
  const peer = new Peer();
  const initial = JSON.parse(await readFile(file, "utf8"));
  assert.equal(Object.hasOwn(initial, "nome"), false);
  assert.equal(peer.nome, undefined);
  assert.equal(peer.ip, "192.168.1.10");
  assert.match(peer.id, /^[0-9a-f-]{36}$/);
  assert.equal(new Peer(), peer);
  assert.deepEqual(peer.getPeers(), [{ ...initial, nome: "" }]);

  const external = { nome: "Notebook", ip: "192.168.1.20", id: "e3743d67-6215-4b5d-a67c-31a45ee4f60a", extra: "preservado" };
  await writeFile(file, JSON.stringify(external));
  assert.equal(peer.nome, external.nome);
  assert.equal(peer.ip, external.ip);
  assert.equal(peer.id, external.id);
  peer.nome = "MeuPC";
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { ...external, nome: "MeuPC" });
  assert.deepEqual(peer.toJSON(), { nome: "MeuPC", ip: external.ip, id: external.id });
  assert.deepEqual(peer.getPeers()[0], peer.toJSON());
  assert.throws(() => { peer.id = initial.id; }, TypeError);

  const before = await readFile(file, "utf8");
  for (const nome of [undefined, null, "", " ", 123, {}, "Com espaço", "tab\t", "fim\n", "abcdefghijklmnop"]) {
    assert.throws(() => { peer.nome = nome; }, TypeError);
    assert.equal(await readFile(file, "utf8"), before);
  }

  // Uma nova avaliação do módulo simula outro processo da API.
  const { default: RestartedPeer } = await import(`${moduleUrl.href}?restart`);
  const restarted = new RestartedPeer();
  assert.equal(restarted.nome, "MeuPC");
  assert.equal(restarted.id, external.id);
  assert.equal(restarted.ip, "192.168.1.10");
  assert.deepEqual(restarted.getPeers()[0], restarted.toJSON());
});

const local = { nome: "MeuPC", ip: "192.168.1.20", id: "e3743d67-6215-4b5d-a67c-31a45ee4f60a" };
const first = { nome: "Primeiro", ip: "192.168.1.30", id: "4d53c0cc-0c19-417f-a71a-fd2adb8fcbca" };
const last = { nome: 'PC,"dois"', ip: "192.168.1.40", id: "4b4f27f4-0432-4b39-867f-7737f61d4250" };
const csvOf = (peers) => "nome,ip,id\n" + peers.map((peer) =>
  [peer.nome, peer.ip, peer.id].map((value) => `"${value.replaceAll('"', '""')}"`).join(",") + "\n",
).join("");

test("instanciação move o primeiro registro divergente ao final sem duplicar o próprio id", async (t) => {
  const { Peer, file, peersFile } = await isolatedPeer(t, local, csvOf([first, last, { ...local, nome: "Antigo" }]));
  const peer = new Peer();
  const current = { ...local, ip: "192.168.1.10" };
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), current);
  assert.deepEqual(peer.getPeers(), [current, last, first]);
  assert.equal(await readFile(peersFile, "utf8"), csvOf([current, last, first]));
  peer.nome = 'Novo,"PC"';
  assert.deepEqual(peer.getPeers(), [{ ...current, nome: 'Novo,"PC"' }, last, first]);
  assert.equal(JSON.parse(await readFile(file, "utf8")).nome, 'Novo,"PC"');
});

test("instanciação atualiza nome e IP do primeiro registro correto e mantém a ordem dos demais", async (t) => {
  const { Peer } = await isolatedPeer(t, local, csvOf([{ ...local, nome: "Antigo" }, first, last]));
  const peer = new Peer();
  const current = { ...local, ip: "192.168.1.10" };
  assert.deepEqual(peer.getPeers(), [current, first, last]);
  peer.savePeer({ ...current, nome: "Remoto", ip: "192.168.1.99" });
  assert.deepEqual(peer.getPeers()[0], current, "A descoberta não sobrescreve a identidade local");
  assert.throws(() => peer.removePeer(peer.id), TypeError);
  assert.throws(() => peer.updatePeer(peer.id, { ip: "192.168.1.99" }), TypeError);
  assert.equal(peer.updatePeer(first.id, { nome: "OutroPC" }), true);
  assert.equal(peer.removePeer(first.id), true);
  assert.deepEqual(peer.getPeers(), [current, last]);
});

test("isRegistered consulta UUIDs completos, trata ausência e sai antes de ler registros seguintes", async (t) => {
  const { Peer, peersFile } = await isolatedPeer(t, local, csvOf([local, first, last]));
  const peer = new Peer();
  for (const id of [local.id, first.id, last.id]) assert.equal(await peer.isRegistered(id), true);
  for (const id of [undefined, null, "", "inválido", local.id.slice(0, 8), "6d895d28-3105-4ab0-902a-2bb6e6bc7d65"]) {
    assert.equal(await peer.isRegistered(id), false);
  }
  await writeFile(peersFile, csvOf([last]).replaceAll("\n", "\r\n") + "registro inválido\r\n".repeat(10000));
  assert.equal(await peer.isRegistered(last.id), true, "early exit ignora o restante do CSV após encontrar o id");
  await assert.rejects(peer.isRegistered(local.id), /registro|Registro/);
  await writeFile(peersFile, "cabeçalho inválido\n" + csvOf([local]));
  await assert.rejects(peer.isRegistered(local.id), /Cabeçalho/);
  await rm(peersFile);
  assert.equal(await peer.isRegistered(local.id), false);
});

test("identidade salva sem nome mantém seu UUID; identidade inválida não é sobrescrita", async (t) => {
  const saved = { ip: "192.168.1.20", id: "e3743d67-6215-4b5d-a67c-31a45ee4f60a" };
  const { Peer, file, moduleUrl } = await isolatedPeer(t, saved);
  assert.equal(new Peer().id, saved.id);
  assert.equal(new Peer().nome, undefined);
  await writeFile(file, JSON.stringify({ ...saved, nome: null }));
  const { default: PendingPeer } = await import(`${moduleUrl.href}?pending`);
  assert.equal(new PendingPeer().nome, null);

  for (const [index, invalid] of [[], { ip: saved.ip }, { ...saved, id: "inválido" }].entries()) {
    const before = JSON.stringify(invalid);
    await writeFile(file, before);
    const { default: InvalidPeer } = await import(`${moduleUrl.href}?invalid=${index}`);
    assert.throws(() => new InvalidPeer());
    assert.equal(await readFile(file, "utf8"), before);
  }
});

test("GET / lê a identidade; POST / exige Vite local e altera apenas nome", async (t) => {
  const { Peer, file } = await isolatedPeer(t);
  const peer = new Peer();
  let address = "127.0.0.1";
  const app = express();
  app.use(express.json());
  app.use(cors());
  app.use((request, _response, next) => {
    Object.defineProperty(request.socket, "remoteAddress", { value: address, configurable: true });
    next();
  });
  app.use("/", identityRoute(peer));
  app.use((error, _request, response, _next) => response.status(500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/`;
  const origin = `http://localhost:${network.vitePort}`;
  const post = (body, requestOrigin = origin) => fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(requestOrigin ? { Origin: requestOrigin } : {}), "X-Forwarded-For": "127.0.0.1" },
    body: JSON.stringify(body),
  });
  const initial = peer.toJSON();
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ip: initial.ip, id: initial.id });

  const before = await readFile(file, "utf8");
  for (const [remoteAddress, requestOrigin] of [
    ["127.0.0.1", null],
    ["127.0.0.1", "null"],
    ["127.0.0.1", `http://localhost:${network.vitePort + 1}`],
    ["127.0.0.1", `http://192.168.1.99:${network.vitePort}`],
    ["::ffff:192.168.1.99", origin],
  ]) {
    address = remoteAddress;
    const rejected = await post({ nome: "Intruso" }, requestOrigin);
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get("access-control-allow-origin"), null);
    assert.equal(await readFile(file, "utf8"), before);
  }

  address = "::ffff:192.168.1.10";
  for (const body of [undefined, {}, [], { nome: null }, { nome: "" }, { nome: " " }, { nome: 123 },
    { nome: "Com espaço" }, { nome: "abcdefghijklmnop" },
    { nome: "MeuPC", ip: "192.168.1.99" }, { nome: "MeuPC", id: initial.id }]) {
    assert.equal((await post(body)).status, 400);
    assert.equal(await readFile(file, "utf8"), before);
  }

  for (const nome of ["MeuPC", "NovoNome"]) {
    const saved = await post({ nome });
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get("access-control-allow-origin"), origin);
    assert.equal(saved.headers.get("cache-control"), "no-store");
    const expected = { ...initial, nome };
    assert.deepEqual(await saved.json(), expected);
    assert.deepEqual(await (await fetch(url)).json(), expected);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), expected);
    assert.deepEqual(peer.getPeers()[0], expected);
  }

  await rm(file);
  assert.equal((await fetch(url)).status, 500);
  assert.equal((await post({ nome: "MeuPC" })).status, 500);
});
