import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const localUrl = "http://192.168.1.10:3000";
const first = { nome: "arthur", ip: "192.168.1.20", id: "e3743d67-6215-4b5d-a67c-31a45ee4f60a" };
const second = { nome: "Notebook", ip: "192.168.1.30", id: "4d53c0cc-0c19-417f-a71a-fd2adb8fcbca" };

async function loadFetcher(cidrs) {
  // Substitui apenas as variáveis que o Vite injeta, sem consultar a rede real.
  const env = JSON.stringify({ LOCAL_API_URL: localUrl, LOCAL_NETWORK_CIDRS: cidrs });
  const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const directory = new URL("../controller/fetchers/", import.meta.url);
  const discovery = (await readFile(new URL("peers.js", directory), "utf8"))
    .replaceAll("import.meta.env", env);
  const source = (await readFile(new URL("Fetcher.js", directory), "utf8"))
    .replaceAll("import.meta.env", env)
    .replace(/"\.\/(\w+\.js)"/g, (_match, file) => JSON.stringify(
      file === "peers.js" ? moduleUrl(discovery) : new URL(file, directory).href,
    ));
  return import(moduleUrl(source));
}

const { Fetcher } = await loadFetcher(["192.168.1.1/30", "192.168.1.2/32"]);

test("nome é consultado e salvo na API local mesmo com outro Peer selecionado", async (t) => {
  const fetcher = new Fetcher();
  fetcher.targetPeer = second;
  let identity = { ip: "192.168.1.10", id: first.id };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, `${localUrl}/identity`);
    if (options.method === "POST") {
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), { nome: "MeuPC" });
      identity = { ...identity, nome: "MeuPC" };
    } else {
      assert.equal(options.cache, "no-store");
    }
    return Response.json(identity);
  });
  assert.equal((await fetcher.getLocalIdentity()).nome, undefined);
  assert.deepEqual(await fetcher.setLocalName("MeuPC"), identity);
  assert.equal((await fetcher.getLocalIdentity()).nome, "MeuPC");
  assert.deepEqual(fetcher.targetPeer, second);
});

test("identity propaga falhas e só confirma um nome salvo pela API", async (t) => {
  const fetcher = new Fetcher();
  for (const status of [400, 403, 500]) {
    t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Falha ao salvar nome." }, { status }));
    await assert.rejects(fetcher.getLocalIdentity(), /Falha ao salvar nome/);
    await assert.rejects(fetcher.setLocalName("MeuPC"), /Falha ao salvar nome/);
  }
  t.mock.method(globalThis, "fetch", async () => new Response("indisponível", { status: 503 }));
  await assert.rejects(fetcher.getLocalIdentity(), /503/);
  for (const identity of [{}, null, [], { ...first, nome: 123 }]) {
    t.mock.method(globalThis, "fetch", async () => Response.json(identity));
    await assert.rejects(fetcher.getLocalIdentity(), /identidade válida/);
  }
  for (const nome of [undefined, null, "", "OutroNome"]) {
    t.mock.method(globalThis, "fetch", async () => Response.json({ ...first, nome }));
    await assert.rejects(fetcher.setLocalName("MeuPC"), /não confirmou/);
  }
});

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
  const fetcher = new Fetcher();
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, `${localUrl}/peer`);
    return Response.json({ peers: [first, second] });
  });
  assert.deepEqual(await fetcher.getPeer(), [first, second]);
  assert.deepEqual(await fetcher.getPeer({}), [first, second]);
  for (const key of ["nome", "ip", "id"]) {
    assert.deepEqual(await fetcher.getPeer({ [key]: first[key] }), first);
  }
  assert.equal(await fetcher.getPeer({ id: first.id, ip: second.ip }), null);
  for (const filter of [null, [], "arthur", { id: "" }, { url: localUrl }]) {
    await assert.rejects(fetcher.getPeer(filter), TypeError);
  }
  t.mock.method(globalThis, "fetch", async () => Response.json({ peers: [first, { ...second, nome: first.nome }] }));
  await assert.rejects(fetcher.getPeer({ nome: first.nome }), /Mais de um Peer/);
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 403 }));
  await assert.rejects(fetcher.getPeer(), /403/);
  t.mock.method(globalThis, "fetch", async () => Response.json({ peers: [{ ...first, ip: "inválido" }] }));
  await assert.rejects(fetcher.getPeer(), /lista de Peers válida/);
});

test("seleção é explícita e direciona listagem, upload e download para um único Peer", async (t) => {
  useStorage(t);
  const fetcher = new Fetcher();
  const requests = [];
  let clicked = false;
  setGlobal(t, "document", {
    createElement: () => ({ click() { clicked = true; }, remove() {} }),
    body: { appendChild() {} },
  });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    if (url === `${localUrl}/identity`) return Response.json(second);
    if (url === `${localUrl}/peer`) return Response.json({ peers: [first, second] });
    if (url.endsWith("/files/list/")) return Response.json({ files: [], directories: [] });
    return Response.json({ filename: "olá.txt", mimeType: "text/plain", data: "b2k=" });
  });
  assert.equal(fetcher.targetPeer, null);
  assert.equal(fetcher.targetPeerURL, "");
  for (const method of ["listFiles", "uploadFile", "downloadFile"]) {
    assert.throws(() => fetcher[method](), /Selecione um Peer/);
  }
  assert.equal(requests.length, 0);
  for (const criteria of [undefined, {}]) {
    await assert.rejects(fetcher.selectPeer(criteria), /Informe nome, ip ou id/);
  }
  assert.equal(requests.length, 0);
  await fetcher.selectPeer({ nome: first.nome });
  assert.equal(fetcher.targetPeerURL, `http://${first.ip}:3000`);
  await fetcher.listFiles();
  await fetcher.uploadFile({ filename: "olá.txt", data: "b2k=" });
  await fetcher.downloadFile("olá.txt");
  const fileRequests = requests.filter(({ url }) => url.includes("/files/"));
  assert.deepEqual(fileRequests.map(({ url }) => url), [
    `http://${first.ip}:3000/files/list/`,
    `http://${first.ip}:3000/files/upload`,
    `http://${first.ip}:3000/files/download/ol%C3%A1.txt`,
  ]);
  assert.equal(fileRequests[1].options.method, "POST");
  for (const request of fileRequests) {
    assert.equal(request.options.headers["X-Peer-Id"], second.id, "Envia o id local, mesmo com outro Peer selecionado");
  }
  assert.deepEqual(JSON.parse(fileRequests[1].options.body), { filename: "olá.txt", data: "b2k=" });
  assert.equal(clicked, true);
  await fetcher.selectPeer({ ip: second.ip });
  assert.deepEqual(fetcher.targetPeer, second);
  await assert.rejects(fetcher.selectPeer({ id: "ausente" }), /não encontrado/);
  assert.deepEqual(fetcher.targetPeer, second);
});

test("fetchers enviam somente o caminho relativo e preservam arquivos e diretórios", async (t) => {
  const fetcher = new Fetcher();
  fetcher.targetPeer = first;
  const directoryPath = "Faculdade/Revisão & notas #1%";
  const filename = "anotações.txt";
  const listing = {
    directories: [{ name: "Janeiro" }],
    files: [{ filename, mimeType: "text/plain", size: 2, lastModified: "2026-11-18T12:00:00.000Z" }],
  };
  let savedName;
  setGlobal(t, "document", {
    createElement: () => ({ click() { savedName = this.download; }, remove() {} }),
    body: { appendChild() {} },
  });
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url === `${localUrl}/identity`) return Response.json(second);
    requests.push(url);
    if (url.includes("/download/")) return Response.json({ filename, mimeType: "text/plain", data: "b2k=" });
    return Response.json(listing);
  });
  assert.deepEqual(await fetcher.listFiles(directoryPath), listing);
  await fetcher.downloadFile(`${directoryPath}/${filename}`);
  assert.deepEqual(requests, [
    `${fetcher.targetPeerURL}/files/list/${encodeURIComponent(directoryPath)}`,
    `${fetcher.targetPeerURL}/files/download/${encodeURIComponent(`${directoryPath}/${filename}`)}`,
  ]);
  assert.equal(savedName, filename);

  for (const invalid of [null, { files: [] }, { files: [], directories: [{}] }, { files: [{}], directories: [] }]) {
    t.mock.method(globalThis, "fetch", async (url) => Response.json(url === `${localUrl}/identity` ? second : invalid));
    await assert.rejects(fetcher.listFiles(), /lista de arquivos e diretórios válida/);
  }
  t.mock.method(globalThis, "fetch", async (url) => url === `${localUrl}/identity`
    ? Response.json(second)
    : Response.json({ error: "Acesso fora do diretório compartilhado." }, { status: 403 }));
  await assert.rejects(fetcher.listFiles(".."), /Acesso fora/);
  await assert.rejects(fetcher.downloadFile("../privado.txt"), /Acesso fora/);
});

test("falha ao consultar identidade local impede requisições de arquivos", async (t) => {
  const fetcher = new Fetcher();
  fetcher.targetPeer = first;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, `${localUrl}/identity`);
    return Response.json({ error: "Identidade indisponível." }, { status: 500 });
  });
  await assert.rejects(fetcher.listFiles(), /Identidade indisponível/);
  await assert.rejects(fetcher.downloadFile("arquivo.txt"), /Identidade indisponível/);
  await assert.rejects(fetcher.uploadFile({ filename: "arquivo.txt", data: "b2k=" }), /Identidade indisponível/);
});

test("localStorage guarda objetos por id, atualiza IP e remove somente o Peer pedido", async (t) => {
  const values = useStorage(t);
  const fetcher = new Fetcher();
  let records = [first, second];
  t.mock.method(globalThis, "fetch", async () => Response.json({ peers: records }));
  values.set(fetcher.LOCAL_STORAGE_KEY, "JSON inválido");
  await fetcher.setPeerAtLocalStorage(first.id);
  await fetcher.setPeerAtLocalStorage(second.id);
  records = [{ ...first, ip: "192.168.1.40" }, second];
  await fetcher.setPeerAtLocalStorage(first.id);
  assert.deepEqual(JSON.parse(values.get(fetcher.LOCAL_STORAGE_KEY)).peers, records);
  await assert.rejects(fetcher.setPeerAtLocalStorage("ausente"), /não encontrado/);
  fetcher.removePeerAtLocalStorage(first.id);
  assert.deepEqual(JSON.parse(values.get(fetcher.LOCAL_STORAGE_KEY)).peers, [second]);
  assert.equal(fetcher.targetPeer, null);
});

test("seleção também funciona quando localStorage não está disponível", async (t) => {
  setGlobal(t, "localStorage", undefined);
  const fetcher = new Fetcher();
  t.mock.method(globalThis, "fetch", async () => Response.json({ peers: [second] }));
  await fetcher.selectPeer({ id: second.id });
  assert.deepEqual(fetcher.targetPeer, second);
});

test("deletePeer só limpa cache e alvo após confirmar a exclusão na API local", async (t) => {
  const values = useStorage(t);
  const fetcher = new Fetcher();
  let status = 500;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!options) return Response.json({ peers: [first, second] });
    assert.equal(options.method, "DELETE");
    assert.ok([first.id, second.id].some((id) => url === `${localUrl}/peer/${id}`));
    return new Response(null, { status });
  });
  await fetcher.selectPeer({ id: first.id });
  await fetcher.setPeerAtLocalStorage(second.id);
  await assert.rejects(fetcher.deletePeer(first.id), /500/);
  assert.deepEqual(fetcher.targetPeer, first);
  assert.equal(JSON.parse(values.get(fetcher.LOCAL_STORAGE_KEY)).peers.length, 2);
  status = 204;
  await fetcher.deletePeer(second.id);
  assert.deepEqual(fetcher.targetPeer, first);
  await fetcher.deletePeer(first.id);
  assert.equal(fetcher.targetPeer, null);
  assert.equal(fetcher.targetPeerURL, "");
  assert.deepEqual(JSON.parse(values.get(fetcher.LOCAL_STORAGE_KEY)).peers, []);
});

test("descoberta paralela persiste identidades, ignora hosts inválidos e acompanha o id selecionado", async (t) => {
  const values = useStorage(t);
  const fetcher = new Fetcher();
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
    if (url === "http://192.168.1.0:3000/identity") return Response.json({ unrelated: true });
    if (url === "http://192.168.1.1:3000/identity") return Response.json({ ...first, nome: "Alterado", ip: "192.168.1.1" });
    if (url === "http://192.168.1.2:3000/identity") return Response.json({ ...second, ip: "192.168.1.2" });
    assert.equal(url, "http://192.168.1.3:3000/identity");
    throw new TypeError("Dispositivo offline");
  });
  const found = await fetcher.discoverPeers();
  assert.equal(fetcher.targetPeer, null);
  assert.ok(maxActive > 1);
  assert.deepEqual(savedIds.sort(), [first.id, second.id].sort());
  assert.deepEqual(found, records);
  assert.deepEqual(JSON.parse(values.get(fetcher.LOCAL_STORAGE_KEY)).peers, records);
  await fetcher.selectPeer({ id: first.id });
  records[0].ip = "192.168.1.40";
  await fetcher.selectPeer({ id: first.id });
  await fetcher.discoverPeers();
  assert.equal(fetcher.targetPeer.nome, first.nome);
  assert.equal(fetcher.targetPeerURL, "http://192.168.1.1:3000");
});

test("descoberta sem CIDRs não faz requisições e falha de gravação é reportada", async (t) => {
  useStorage(t);
  const { Fetcher: NoNetworkFetcher } = await loadFetcher([]);
  t.mock.method(globalThis, "fetch", async () => { assert.fail("Não deve consultar nenhuma rede"); });
  assert.deepEqual(await new NoNetworkFetcher().discoverPeers(), []);
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url === `${localUrl}/peer`) return new Response(null, { status: 500 });
    return Response.json(first);
  });
  const fetcher = new Fetcher();
  await assert.rejects(fetcher.discoverPeers(), /não foi possível salvar/);
  assert.equal(fetcher.targetPeer, null);
  assert.equal(localStorage.getItem(fetcher.LOCAL_STORAGE_KEY), null);
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
  const pending = new Fetcher().discoverPeers({ signal: controller.signal });
  assert.equal(requests.length, 4);
  controller.abort();
  assert.deepEqual(await pending, []);
  assert.equal(requests.length, 4);
  assert.deepEqual(await new Fetcher().discoverPeers({ signal: controller.signal }), []);
  assert.equal(requests.length, 4);
});

test("diretório usa sempre a API local e migra o cache sem perder peers", async (t) => {
  const values = useStorage(t);
  const fetcher = new Fetcher();
  values.set(fetcher.LOCAL_STORAGE_KEY, JSON.stringify([first, second]));
  fetcher.targetPeer = second;
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
  assert.equal(fetcher.sharedDir, null);
  assert.deepEqual(JSON.parse(values.get(fetcher.LOCAL_STORAGE_KEY)), [first, second]);
  await fetcher.setSharedDir(selected);
  assert.deepEqual(JSON.parse(values.get(fetcher.LOCAL_STORAGE_KEY)), { peers: [first, second], SHARED_DIR: selected });
  assert.deepEqual(fetcher.targetPeer, second);

  rejectUpdate = true;
  await assert.rejects(fetcher.setSharedDir("/ausente"), /Diretório não encontrado/);
  assert.equal(fetcher.sharedDir, selected);
  assert.equal(fetcher.sharedDir, selected);

  fetcher.removePeerAtLocalStorage(first.id);
  await fetcher.setPeerAtLocalStorage(second.id);
  assert.deepEqual(JSON.parse(values.get(fetcher.LOCAL_STORAGE_KEY)), { peers: [second], SHARED_DIR: selected });
  rejectUpdate = false;
  sharedDir = null; // Simula o reinício do processo da API.
  assert.equal(await new Fetcher().getSharedDir(), selected);
  assert.equal(sharedDir, selected);
});

test("diretório rejeita respostas inválidas e não restaura cache se o acesso local for negado", async (t) => {
  const values = useStorage(t);
  const fetcher = new Fetcher();
  const stored = { peers: [first], SHARED_DIR: "/tmp/antes" };
  values.set(fetcher.LOCAL_STORAGE_KEY, JSON.stringify(stored));
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return Response.json({ error: "Acesso permitido apenas ao Vite local." }, { status: 403 });
  });
  await assert.rejects(fetcher.getSharedDir(), /Vite local/);
  assert.equal(requests, 1);
  for (const result of [{}, { SHARED_DIR: 12 }, { SHARED_DIR: "" }, { SHARED_DIR: null }]) {
    t.mock.method(globalThis, "fetch", async () => Response.json(result));
    await assert.rejects(fetcher.setSharedDir("/tmp/depois"), /diretório/);
    assert.deepEqual(JSON.parse(values.get(fetcher.LOCAL_STORAGE_KEY)), stored);
  }
  setGlobal(t, "localStorage", undefined);
  t.mock.method(globalThis, "fetch", async () => Response.json({ SHARED_DIR: "/tmp/depois" }));
  assert.equal(await fetcher.setSharedDir("/tmp/depois"), "/tmp/depois");
});
