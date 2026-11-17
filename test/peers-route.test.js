import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import cors from "cors";
import peersRoute from "../controller/routes/peers.js";
import network from "../model/Network.js";

test("GET /peer exige conexão e origem locais antes de ler os registros", async (t) => {
  t.mock.method(network, "getIps", () => ["192.168.1.10"]);
  const records = [{ nome: "Notebook", ip: "192.168.1.20", id: "exemplo" }];
  let readCount = 0;
  let address;
  let failRead = false;
  const peer = {
    getPeers() {
      readCount++;
      if (failRead) throw new Error("Falha ao ler CSV");
      return records;
    },
  };
  const app = express();
  app.use(cors()); // Reproduz o CORS geral, que não deve liberar esta rota.
  app.use((request, _response, next) => {
    // Simula endereços de conexão indisponíveis no ambiente de testes.
    if (address) Object.defineProperty(request.socket, "remoteAddress", { value: address, configurable: true });
    next();
  });
  app.use("/peer", peersRoute(peer));
  app.use((error, _request, response, _next) => response.status(500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/peer`;

  await t.test("aceita Vite local e retorna um array no JSON", async () => {
    for (const origin of [`http://localhost:${network.vitePort}`, `http://127.0.0.1:${network.vitePort}`, `http://[::1]:${network.vitePort}`, `http://192.168.1.10:${network.vitePort}`]) {
      const response = await fetch(url, { headers: { Origin: origin } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { peers: records });
    }
  });

  await t.test("rejeita origem ausente, null, remota, outra porta e domínio parecido", async () => {
    const before = readCount;
    for (const origin of [undefined, "null", `http://localhost:${network.vitePort === 4173 ? 4174 : 4173}`, `https://localhost:${network.vitePort}`, `http://192.168.1.99:${network.vitePort}`, `http://localhost.evil:${network.vitePort}`]) {
      const response = await fetch(url, { headers: origin ? { Origin: origin } : {} });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
    }
    assert.equal(readCount, before);
  });

  await t.test("rejeita conexão remota mesmo com Origin e X-Forwarded-For locais", async () => {
    address = "::ffff:192.168.1.99";
    const before = readCount;
    const response = await fetch(url, { headers: {
      Origin: `http://localhost:${network.vitePort}`, "X-Forwarded-For": "127.0.0.1",
    } });
    assert.equal(response.status, 403);
    assert.equal(readCount, before);
  });

  await t.test("aceita IP local mapeado em IPv6 e retorna lista vazia", async () => {
    address = "::ffff:192.168.1.10";
    records.length = 0;
    const response = await fetch(url, { headers: { Origin: `http://localhost:${network.vitePort}` } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { peers: [] });
  });

  await t.test("encaminha erros de leitura ao tratamento de erros da API", async () => {
    failRead = true;
    const response = await fetch(url, { headers: { Origin: `http://localhost:${network.vitePort}` } });
    assert.equal(response.status, 500);
  });
});

test("DELETE /peer/:id exige Vite local e delega a exclusão ao Model", async (t) => {
  t.mock.method(network, "getIps", () => ["192.168.1.10"]);
  const removed = [];
  let address;
  const peer = {
    removePeer(id) {
      removed.push(id);
      if (id === "inválido") throw new TypeError("O id deve ser um UUID.");
      if (id === "falha") throw new Error("Falha ao gravar CSV");
      return id === "salvo";
    },
  };
  const app = express();
  app.use(cors({ methods: ["GET", "POST", "DELETE", "OPTIONS"] }));
  app.use((request, _response, next) => {
    if (address) Object.defineProperty(request.socket, "remoteAddress", { value: address, configurable: true });
    next();
  });
  app.use("/peer", peersRoute(peer));
  app.use((error, _request, response, _next) => response.status(500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/peer`;
  const origin = `http://localhost:${network.vitePort}`;

  const preflight = await fetch(`${url}/salvo`, { method: "OPTIONS", headers: {
    Origin: origin, "Access-Control-Request-Method": "DELETE",
  } });
  assert.equal(preflight.status, 204);
  assert.ok(preflight.headers.get("access-control-allow-methods").includes("DELETE"));

  for (const invalidOrigin of [undefined, `http://192.168.1.99:${network.vitePort}`]) {
    const response = await fetch(`${url}/salvo`, {
      method: "DELETE", headers: invalidOrigin ? { Origin: invalidOrigin } : {},
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  address = "::ffff:192.168.1.99";
  const remote = await fetch(`${url}/salvo`, {
    method: "DELETE", headers: { Origin: origin, "X-Forwarded-For": "127.0.0.1" },
  });
  assert.equal(remote.status, 403);
  assert.deepEqual(removed, []);

  address = "::ffff:192.168.1.10";
  for (const [id, expectedStatus] of [["salvo", 204], ["ausente", 404], ["inválido", 400], ["falha", 500]]) {
    const response = await fetch(`${url}/${encodeURIComponent(id)}`, {
      method: "DELETE", headers: { Origin: origin },
    });
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  }
  assert.deepEqual(removed, ["salvo", "ausente", "inválido", "falha"]);
});
