import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const localUrl = "http://192.168.1.10:3000";
const first = { nome: "arthur", ip: "192.168.1.20", id: "e3743d67-6215-4b5d-a67c-31a45ee4f60a" };
const second = { nome: "Notebook", ip: "192.168.1.30", id: "4d53c0cc-0c19-417f-a71a-fd2adb8fcbca" };

async function loadAPI(cidrs) {
  // Substitui apenas as variáveis que o Vite injeta, sem consultar a rede real.
  const env = JSON.stringify({ LOCAL_API_URL: localUrl, LOCAL_NETWORK_CIDRS: cidrs });
  const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const directory = new URL("../controller/fetchers/", import.meta.url);
  const discovery = (await readFile(new URL("discovery.js", directory), "utf8"))
    .replaceAll("import.meta.env", env);
  const source = (await readFile(new URL("API.js", directory), "utf8"))
    .replaceAll("import.meta.env", env)
    .replace(/"\.\/(\w+\.js)"/g, (_match, file) => JSON.stringify(
      file === "discovery.js" ? moduleUrl(discovery) : new URL(file, directory).href,
    ));
  return import(moduleUrl(source));
}

const { API } = await loadAPI(["192.168.1.1/30", "192.168.1.2/32"]);

function setGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  });
}

function useStorage(t) {
  const values = new Map();
  setGlobal(t, "localStorage", {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  return values;
}

test("getPeer consulta o cadastro local e filtra todos os campos fornecidos", async (t) => {
  const api = new API();
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, `${localUrl}/peer`);
    return Response.json({ peers: [first, second] });
  });
  assert.deepEqual(await api.getPeer(), [first, second]);
  assert.deepEqual(await api.getPeer({}), [first, second]);
  for (const key of ["nome", "ip", "id"]) {
    assert.deepEqual(await api.getPeer({ [key]: first[key] }), first);
  }
  assert.equal(await api.getPeer({ id: first.id, ip: second.ip }), null);
  for (const filter of [null, [], "arthur", { id: "" }, { url: localUrl }]) {
    await assert.rejects(api.getPeer(filter), TypeError);
  }
  t.mock.method(globalThis, "fetch", async () => Response.json({ peers: [first, { ...second, nome: first.nome }] }));
  await assert.rejects(api.getPeer({ nome: first.nome }), /Mais de um Peer/);
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 403 }));
  await assert.rejects(api.getPeer(), /403/);
  t.mock.method(globalThis, "fetch", async () => Response.json({ peers: [{ ...first, ip: "inválido" }] }));
  await assert.rejects(api.getPeer(), /lista de Peers válida/);
});

test("seleção é explícita e direciona listagem, upload e download para um único Peer", async (t) => {
  useStorage(t);
  const api = new API();
  const requests = [];
  let clicked = false;
  setGlobal(t, "document", {
    createElement: () => ({ click() { clicked = true; }, remove() {} }),
    body: { appendChild() {} },
  });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    if (url === `${localUrl}/peer`) return Response.json({ peers: [first, second] });
    if (url.endsWith("/files")) return Response.json({ files: [] });
    return Response.json({ filename: "olá.txt", mimeType: "text/plain", data: "b2k=" });
  });
  assert.equal(api.targetPeer, null);
  assert.equal(api.targetPeerURL, "");
  for (const method of ["listFiles", "uploadFile", "downloadFile"]) {
    assert.throws(() => api[method](), /Selecione um Peer/);
  }
  assert.equal(requests.length, 0);
  for (const criteria of [undefined, {}]) {
    await assert.rejects(api.selectPeer(criteria), /Informe nome, ip ou id/);
  }
  assert.equal(requests.length, 0);
  await api.selectPeer({ nome: first.nome });
  assert.equal(api.targetPeerURL, `http://${first.ip}:3000`);
  await api.listFiles();
  await api.uploadFile({ filename: "olá.txt", data: "b2k=" });
  await api.downloadFile("olá.txt");
  const fileRequests = requests.filter(({ url }) => url !== `${localUrl}/peer`);
  assert.deepEqual(fileRequests.map(({ url }) => url), [
    `http://${first.ip}:3000/files`,
    `http://${first.ip}:3000/files/upload`,
    `http://${first.ip}:3000/files/download/ol%C3%A1.txt`,
  ]);
  assert.equal(fileRequests[1].options.method, "POST");
  assert.deepEqual(JSON.parse(fileRequests[1].options.body), { filename: "olá.txt", data: "b2k=" });
  assert.equal(clicked, true);
  await api.selectPeer({ ip: second.ip });
  assert.deepEqual(api.targetPeer, second);
  await assert.rejects(api.selectPeer({ id: "ausente" }), /não encontrado/);
  assert.deepEqual(api.targetPeer, second);
});

test("localStorage guarda objetos por id, atualiza IP e remove somente o Peer pedido", async (t) => {
  const values = useStorage(t);
  const api = new API();
  let records = [first, second];
  t.mock.method(globalThis, "fetch", async () => Response.json({ peers: records }));
  values.set(api.LOCAL_STORAGE_KEY, "JSON inválido");
  await api.setPeerAtLocalStorage(first.id);
  await api.setPeerAtLocalStorage(second.id);
  records = [{ ...first, ip: "192.168.1.40" }, second];
  await api.setPeerAtLocalStorage(first.id);
  assert.deepEqual(JSON.parse(values.get(api.LOCAL_STORAGE_KEY)).peers, records);
  await assert.rejects(api.setPeerAtLocalStorage("ausente"), /não encontrado/);
  api.removePeerAtLocalStorage(first.id);
  assert.deepEqual(JSON.parse(values.get(api.LOCAL_STORAGE_KEY)).peers, [second]);
  assert.equal(api.targetPeer, null);
});

test("seleção também funciona quando localStorage não está disponível", async (t) => {
  setGlobal(t, "localStorage", undefined);
  const api = new API();
  t.mock.method(globalThis, "fetch", async () => Response.json({ peers: [second] }));
  await api.selectPeer({ id: second.id });
  assert.deepEqual(api.targetPeer, second);
});

test("deletePeer só limpa cache e alvo após confirmar a exclusão na API local", async (t) => {
  const values = useStorage(t);
  const api = new API();
  let status = 500;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!options) return Response.json({ peers: [first, second] });
    assert.equal(options.method, "DELETE");
    assert.ok([first.id, second.id].some((id) => url === `${localUrl}/peer/${id}`));
    return new Response(null, { status });
  });
  await api.selectPeer({ id: first.id });
  await api.setPeerAtLocalStorage(second.id);
  await assert.rejects(api.deletePeer(first.id), /500/);
  assert.deepEqual(api.targetPeer, first);
  assert.equal(JSON.parse(values.get(api.LOCAL_STORAGE_KEY)).peers.length, 2);
  status = 204;
  await api.deletePeer(second.id);
  assert.deepEqual(api.targetPeer, first);
  await api.deletePeer(first.id);
  assert.equal(api.targetPeer, null);
  assert.equal(api.targetPeerURL, "");
  assert.deepEqual(JSON.parse(values.get(api.LOCAL_STORAGE_KEY)).peers, []);
});

test("descoberta paralela persiste identidades, ignora hosts inválidos e acompanha o id selecionado", async (t) => {
  const values = useStorage(t);
  const api = new API();
  const records = [{ ...first }];
  const savedIds = [];
  let active = 0;
  let maxActive = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === `${localUrl}/peer`) {
      if (!options) return Response.json({ peers: records });
      assert.equal(options.method, "POST");
      const identity = JSON.parse(options.body);
      savedIds.push(identity.id);
      const existing = records.find((peer) => peer.id === identity.id);
      if (existing) existing.ip = identity.ip;
      else records.push(identity);
      return new Response(null, { status: 204 });
    }
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, "manual");
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    if (url === "http://192.168.1.0:3000/") return Response.json({ unrelated: true });
    if (url === "http://192.168.1.1:3000/") return Response.json({ ...first, nome: "Alterado", ip: "192.168.1.1" });
    if (url === "http://192.168.1.2:3000/") return Response.json({ ...second, ip: "192.168.1.2" });
    assert.equal(url, "http://192.168.1.3:3000/");
    throw new TypeError("Dispositivo offline");
  });
  const found = await api.discoverPeers();
  assert.equal(api.targetPeer, null);
  assert.ok(maxActive > 1);
  assert.deepEqual(savedIds.sort(), [first.id, second.id].sort());
  assert.deepEqual(found, records);
  assert.deepEqual(JSON.parse(values.get(api.LOCAL_STORAGE_KEY)).peers, records);
  await api.selectPeer({ id: first.id });
  records[0].ip = "192.168.1.40";
  await api.selectPeer({ id: first.id });
  await api.discoverPeers();
  assert.equal(api.targetPeer.nome, first.nome);
  assert.equal(api.targetPeerURL, "http://192.168.1.1:3000");
});

test("descoberta sem CIDRs não faz requisições e falha de gravação é reportada", async (t) => {
  useStorage(t);
  const { API: NoNetworkAPI } = await loadAPI([]);
  t.mock.method(globalThis, "fetch", async () => { assert.fail("Não deve consultar nenhuma rede"); });
  assert.deepEqual(await new NoNetworkAPI().discoverPeers(), []);
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url === `${localUrl}/peer`) return new Response(null, { status: 500 });
    return Response.json(first);
  });
  const api = new API();
  await assert.rejects(api.discoverPeers(), /não foi possível salvar/);
  assert.equal(api.targetPeer, null);
  assert.equal(localStorage.getItem(api.LOCAL_STORAGE_KEY), null);
});

test("cancelamento aborta consultas pendentes e não inicia a próxima faixa", async (t) => {
  useStorage(t);
  const controller = new AbortController();
  const requests = [];
  t.mock.method(globalThis, "fetch", (url, { signal }) => {
    requests.push(url);
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
  const pending = new API().discoverPeers({ signal: controller.signal });
  assert.equal(requests.length, 4);
  controller.abort();
  assert.deepEqual(await pending, []);
  assert.equal(requests.length, 4);
  assert.deepEqual(await new API().discoverPeers({ signal: controller.signal }), []);
  assert.equal(requests.length, 4);
});

test("diretório usa sempre a API local e migra o cache sem perder peers", async (t) => {
  const values = useStorage(t);
  const api = new API();
  values.set(api.LOCAL_STORAGE_KEY, JSON.stringify([first, second]));
  api.targetPeer = second;
  let sharedDir = null;
  let rejectUpdate = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === `${localUrl}/peer`) return Response.json({ peers: [first, second] });
    assert.equal(url, `${localUrl}/dir`);
    if (options) {
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Content-Type"], "application/json");
      if (rejectUpdate) return Response.json({ error: "Diretório não encontrado." }, { status: 404 });
      sharedDir = JSON.parse(options.body).SHARED_DIR;
    }
    return Response.json({ SHARED_DIR: sharedDir });
  });

  const selected = "/tmp/Pasta com espaços";
  assert.equal(selected, "/tmp/Pasta com espaços");
  assert.equal(api.sharedDir, null);
  assert.deepEqual(JSON.parse(values.get(api.LOCAL_STORAGE_KEY)), [first, second]);
  await api.setSharedDir(selected);
  assert.deepEqual(JSON.parse(values.get(api.LOCAL_STORAGE_KEY)), { peers: [first, second], SHARED_DIR: selected });
  assert.deepEqual(api.targetPeer, second);

  rejectUpdate = true;
  await assert.rejects(api.setSharedDir("/ausente"), /Diretório não encontrado/);
  assert.equal(api.sharedDir, selected);
  assert.equal(api.sharedDir, selected);

  api.removePeerAtLocalStorage(first.id);
  await api.setPeerAtLocalStorage(second.id);
  assert.deepEqual(JSON.parse(values.get(api.LOCAL_STORAGE_KEY)), { peers: [second], SHARED_DIR: selected });
  rejectUpdate = false;
  sharedDir = null; // Simula o reinício do processo da API.
  assert.equal(await new API().getSharedDir(), selected);
  assert.equal(sharedDir, selected);
});

test("diretório rejeita respostas inválidas e não restaura cache se o acesso local for negado", async (t) => {
  const values = useStorage(t);
  const api = new API();
  const stored = { peers: [first], SHARED_DIR: "/tmp/antes" };
  values.set(api.LOCAL_STORAGE_KEY, JSON.stringify(stored));
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return Response.json({ error: "Acesso permitido apenas ao Vite local." }, { status: 403 });
  });
  await assert.rejects(api.getSharedDir(), /Vite local/);
  assert.equal(requests, 1);
  for (const result of [{}, { SHARED_DIR: 12 }, { SHARED_DIR: "" }, { SHARED_DIR: null }]) {
    t.mock.method(globalThis, "fetch", async () => Response.json(result));
    await assert.rejects(api.setSharedDir("/tmp/depois"), /diretório/);
    assert.deepEqual(JSON.parse(values.get(api.LOCAL_STORAGE_KEY)), stored);
  }
  setGlobal(t, "localStorage", undefined);
  t.mock.method(globalThis, "fetch", async () => Response.json({ SHARED_DIR: "/tmp/depois" }));
  assert.equal(await api.setSharedDir("/tmp/depois"), "/tmp/depois");
});
