import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

async function fixture(t) {
  // Cada teste usa seus próprios arquivos, sem tocar na identidade desta máquina.
  const directory = mkdtempSync(path.join(tmpdir(), "passa-arquivo-peer-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, "model"));
  mkdirSync(path.join(directory, "controller"));
  writeFileSync(path.join(directory, "package.json"), '{"type":"module"}');
  const modulePath = path.join(directory, "model/Peer.js");
  copyFileSync(new URL("../model/Peer.js", import.meta.url), modulePath);
  writeFileSync(path.join(directory, "model/Network.js"), `
    export default {
      ips: ["192.168.1.10", "10.0.0.1"],
      obtainCidrs() {},
      getIps() { return this.ips; },
    };
  `);
  const { default: network } = await import(pathToFileURL(path.join(directory, "model/Network.js")));
  let loadNumber = 0;
  const load = async () => (await import(`${pathToFileURL(modulePath)}?load=${loadNumber++}`)).default;
  return {
    Peer: await load(), load, network,
    identityFile: path.join(directory, "model/identity.json"),
    peersFile: path.join(directory, "controller/peers.csv"),
  };
}

const remote = (nome = "OutroPC") => ({ nome, ip: "192.168.1.20", id: randomUUID() });

test("exige nome inicial, cria UUID e mantém uma única instância", async (t) => {
  const { Peer, identityFile } = await fixture(t);
  assert.throws(() => new Peer(), /nome/);
  assert.equal(existsSync(identityFile), false);
  const peer = new Peer("MeuPC");
  assert.equal(new Peer("Ignorado"), peer);
  assert.equal(new Peer(), peer);
  assert.equal(peer.nome, "MeuPC");
  assert.equal(peer.ip, "192.168.1.10");
  assert.match(peer.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(JSON.parse(readFileSync(identityFile)), peer.toJSON());
  assert.throws(() => { peer.id = randomUUID(); }, TypeError);
  assert.throws(() => Object.defineProperty(peer, "id", { value: randomUUID() }), TypeError);
});

test("ao reiniciar, preserva nome/id e atualiza somente o IP da rede", async (t) => {
  const { Peer, load, network, identityFile } = await fixture(t);
  const first = new Peer("Original").toJSON();
  network.ips = ["10.1.2.3"];
  // Recarregar o módulo recria a classe, como uma nova execução do programa.
  const RestartedPeer = await load();
  const restarted = new RestartedPeer("OutroNome");
  assert.deepEqual(restarted.toJSON(), { ...first, ip: "10.1.2.3" });
  assert.deepEqual(JSON.parse(readFileSync(identityFile)), restarted.toJSON());
  const Again = await load();
  assert.equal(new Again().id, first.id);
});

test("valida nomes e persiste alterações do nome local", async (t) => {
  const { Peer, identityFile } = await fixture(t);
  for (const nome of [undefined, "", " ", "Meu PC", "Meu\tPC", "a\nb", "x".repeat(16)]) {
    assert.throws(() => new Peer(nome), /nome/);
  }
  const peer = new Peer("x".repeat(15));
  for (const nome of ["Inválido Nome", "x".repeat(16)]) {
    assert.throws(() => { peer.nome = nome; }, /nome/);
  }
  peer.nome = "Renomeado";
  assert.equal(JSON.parse(readFileSync(identityFile)).nome, "Renomeado");
});

test("CRUD por id, sem duplicatas ou alteração da chave, preservando CSV escapado", async (t) => {
  const { Peer, peersFile } = await fixture(t);
  const peer = new Peer("Local");
  const first = remote('PC,"A"');
  const second = remote("Segundo");
  assert.deepEqual(peer.getPeers(), []);
  peer.appendPeer(first);
  peer.appendPeer(second);
  assert.ok(readFileSync(peersFile, "utf8").startsWith("nome,ip,id\n"));
  assert.deepEqual(peer.getPeers(), [first, second]);
  const before = readFileSync(peersFile, "utf8");
  assert.throws(() => peer.appendPeer({ ...first, nome: "Duplicado" }), /Já existe/);
  assert.throws(() => peer.updatePeer(first.id, { id: randomUUID() }), /Somente/);
  assert.throws(() => peer.updatePeer(first.id, { extra: true }), /Somente/);
  assert.throws(() => peer.updatePeer(first.id, { ip: "999.1.1.1" }), /IPv4/);
  assert.throws(() => peer.appendPeer(remote("Nome Inválido")), /nome/);
  assert.throws(() => peer.appendPeer({ ...remote(), id: "id-inválido" }), /UUID/);
  assert.equal(readFileSync(peersFile, "utf8"), before);
  assert.equal(peer.updatePeer(first.id, { nome: "Atualizado", ip: "10.0.0.2" }), true);
  assert.deepEqual(peer.getPeers(), [{ ...first, nome: "Atualizado", ip: "10.0.0.2" }, second]);
  assert.equal(peer.updatePeer(randomUUID(), { nome: "Ausente" }), false);
  assert.equal(peer.removePeer(first.id), true);
  assert.equal(peer.removePeer(first.id), false);
  assert.deepEqual(peer.getPeers(), [second]);
  assert.equal(peer.removePeer(second.id), true);
  assert.deepEqual(peer.getPeers(), []);
});

test("rejeita CSV inválido ou duplicado sem sobrescrevê-lo", async (t) => {
  const { Peer, peersFile } = await fixture(t);
  const peer = new Peer("Local");
  const other = remote();
  for (const csv of [
    "url\n", "nome,ip,id\nregistro-incompleto\n", 'nome,ip,id\n"aspas-abertas\n',
    `nome,ip,id\n${other.nome},${other.ip},${other.id}\n${other.nome},${other.ip},${other.id}\n`,
  ]) {
    writeFileSync(peersFile, csv);
    assert.throws(() => peer.appendPeer(remote()));
    assert.equal(readFileSync(peersFile, "utf8"), csv);
  }
});

test("preserva identidade inválida e falha sem IPv4 disponível", async (t) => {
  const { Peer, identityFile, network } = await fixture(t);
  for (const content of ["{", "null", "{}", JSON.stringify({ nome: "PC", id: randomUUID() })]) {
    writeFileSync(identityFile, content);
    assert.throws(() => new Peer("Local"));
    assert.equal(readFileSync(identityFile, "utf8"), content);
  }
  const content = JSON.stringify({ nome: "PC", id: randomUUID(), ip: "192.168.1.9" });
  writeFileSync(identityFile, content);
  network.ips = [];
  assert.throws(() => new Peer(), /IPv4/);
  assert.equal(readFileSync(identityFile, "utf8"), content);
});
