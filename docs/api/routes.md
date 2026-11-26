# Rotas da API

[README](../../README.md) · [MVC](../architecture/MVC.md) · [P2P](../architecture/P2P.md) · [Segurança](security.md)

As rotas são registradas em [`controller/index.js`](../../controller/index.js).
A View usa a instância `fetcher` de [`Fetcher.js`](../../controller/fetchers/Fetcher.js).
Identidade, cadastro de peers e diretório usam `LOCAL_API_URL`; as operações de
arquivos usam `targetPeerURL`, definido após `fetcher.selectPeer({ id })`.

Nas descrições abaixo, **Vite local** indica a verificação de conexão e `Origin`;
**UUID cadastrado** exige `X-Peer-Id` com o UUID do solicitante no cadastro do destino.
Veja os detalhes em [segurança](security.md). Falhas tratadas retornam JSON com
`error`; respostas `204` não têm corpo.

## Identidade — `controller/routes/identity.js`

Implementação: [`routes/identity.js`](../../controller/routes/identity.js).
Fetcher: [`fetchers/identity.js`](../../controller/fetchers/identity.js).

### `GET /identity`

Ao abrir a aplicação, `App.jsx` chama `fetcher.getLocalIdentity()` →
`getLocalIdentity(apiUrl)`. A rota serializa o peer com `Peer.toJSON()` e retorna
`200` com `{ nome, ip, id, publicKey }`. Sem nome definido, `nome` pode estar ausente ou nulo
e a interface abre a tela de nomeação.

**Acesso: Vite local.** A descoberta remota usa `GET /`, que retorna `200`
sem identidade, e então inicia a troca de chaves abaixo.

### `POST /identity`

Na primeira nomeação ou após clicar em **Alterar meu nome**, o usuário confirma
**Salvar nome**. `fetcher.setLocalName(nome)` → `setLocalName(apiUrl, nome)` envia
`{ "nome": "MeuPC" }`. A rota atribui `peer.nome`, persistindo o nome no JSON de
identidade e no registro local do CSV, sem alterar UUID ou IP.

Retorna `200` com a identidade atualizada. Aceita somente `nome`, de 1 a 15
caracteres sem espaços; dados inválidos ou campos extras recebem `400`.
**Acesso: Vite local.**

### `POST /identity/key`

Implementação: [`routes/key.js`](../../controller/routes/key.js).
Fetcher: [`fetchers/key.js`](../../controller/fetchers/key.js), também disponível
por `fetcher.exchangeKeys(apiUrl, { signal })`.

Recebe `{ nome, ip, pubKey }` do requisitor e retorna `200` com
`{ nome, ip, pubKey, id }` do recebedor. Somente `id` é criptografado com a chave
pública enviada, usando `Security.crypt()`. `pubKey` é o nome no protocolo;
no Model e no cadastro, o campo continua sendo `publicKey`.

Dados ou chave pública inválidos recebem `400`; um recebedor ainda sem nome
retorna `409`. A rota não cadastra o requisitor, pois ainda não recebeu seu ID.
**Acesso público.** Esta troca ainda não constitui pareamento autenticado.

### `POST /identity/key/decrypt`

Recebe a resposta criptografada da troca. O backend local usa
`Security.decrypt(Security.privateKey, id)`, valida a identidade completa e
retorna `200` com `{ nome, ip, publicKey, id }`, agora com UUID em texto.
Conteúdo inválido ou impossível de descriptografar recebe `400`.
**Acesso: Vite local.** A chave privada nunca é enviada ao navegador.

O fetcher só envia a identidade a `POST /peer` depois dessa etapa. Cada worker
executa a sequência assim que seu `GET /` retorna `200`, sem esperar o
`Promise.all()` da varredura inteira. Timeout e cancelamento abrangem a troca.

## Peers — `controller/routes/peers.js`

Implementação: [`routes/peers.js`](../../controller/routes/peers.js).
Fetcher: [`fetchers/peers.js`](../../controller/fetchers/peers.js).

### `GET /peer`

Ao abrir **Selecionar Peer**, `fetcher.getPeer()` → `getPeers(apiUrl)` consulta
o cadastro local. A rota chama `peer.getPeers()` e retorna `200` com
`{ "peers": [{ "nome": "MeuPC", "ip": "192.168.1.20", "id": "<uuid>", "publicKey": "<PEM>" }] }`.
O primeiro registro representa a própria máquina.

`fetcher.getPeer({ nome, ip, id })` também usa essa rota, filtrando a resposta no
navegador pelos campos fornecidos; filtros ambíguos exigem maior precisão.
**Acesso: Vite local.**

### `POST /peer`

Ao encontrar um dispositivo durante **Procurar Peers na rede**,
`fetcher.discoverPeers()` → `discoverPeers()` → `saveIdentity()` envia
`{ nome, ip, id, publicKey }` à API local após descriptografar o ID. A rota chama `peer.savePeer()` e retorna `204`.
UUID novo é cadastrado; UUID conhecido atualiza somente o IP. O próprio peer
local é preservado. Identidades inválidas e troca de chave de um ID conhecido
recebem `400`. **Acesso: Vite local.**

### `DELETE /peer/:id`

Ao clicar em **Excluir** na lista de peers, `fetcher.deletePeer(id)` →
`deletePeer(apiUrl, id)` chama a rota, que executa `peer.removePeer(id)`.
Retorna `204` quando exclui, `404` se o UUID não existe e `400` para UUID inválido
ou tentativa de excluir o próprio dispositivo. Após a confirmação, `Fetcher`
remove o cache desse peer e limpa a seleção se ele era o alvo. **Acesso: Vite local.**

## Diretório compartilhado — `controller/routes/dir.js`

Implementação: [`routes/dir.js`](../../controller/routes/dir.js).
Fetcher: [`fetchers/dir.js`](../../controller/fetchers/dir.js).
Ambas as rotas exigem **Vite local**, independentemente do peer selecionado.

### `GET /dir`

Ao abrir **Diretório compartilhado**, `fetcher.getSharedDir()` →
`getSharedDir(apiUrl)` consulta a pasta da máquina local. A rota lê
`process.env.SHARED_DIR` e retorna `200` com `{ "SHARED_DIR": "/caminho/absoluto" }`
ou `{ "SHARED_DIR": null }`. Se a API estiver sem pasta e existir uma escolha no
cache, `Fetcher` tenta restaurá-la por `POST /dir`.

### `POST /dir`

Ao informar **Caminho absoluto** e confirmar **Compartilhar diretório**,
`fetcher.setSharedDir(directory)` → `setSharedDir(apiUrl, directory)` envia
`{ "SHARED_DIR": "/caminho/absoluto" }`. O seletor do navegador fornece o nome
da pasta, mas não o caminho absoluto; esse campo precisa ser informado.

A rota chama `Directory.setSharedDir()`, que valida a pasta e só então atualiza
o ambiente da API. Retorna `200` com o caminho real no campo `SHARED_DIR`;
`Fetcher` salva a escolha no cache. Caminho inválido ou arquivo recebe `400`,
pasta inexistente recebe `404` e falta de permissão recebe `403`. Falhas preservam
a escolha anterior. As próximas operações de arquivos usam a nova raiz.

## Arquivos — `controller/routes/files.js`

[`routes/files.js`](../../controller/routes/files.js) verifica o **UUID cadastrado**
com `peer.isRegistered()` antes de chamar as rotas abaixo.
[`fetchers/files.js`](../../controller/fetchers/files.js) agrupa os três fetchers.
`Fetcher` consulta a identidade local e acrescenta `X-Peer-Id` em cada requisição,
inclusive quando o alvo é a própria máquina. Sem diretório configurado, as
operações válidas retornam `409`; UUID ausente, inválido ou não cadastrado recebe `403`.

### `GET /files/list` e `GET /files/list/:path`

Ao clicar em **Buscar arquivos**, abrir uma pasta ou usar **Voltar**/**Raiz**,
`fetcher.listFiles(directoryPath)` → `listFiles(apiUrl, directoryPath, peerId)`,
em [`fetchers/list.js`](../../controller/fetchers/list.js), codifica o caminho
relativo com `encodeURIComponent`. Sem caminho, lista a raiz; por exemplo,
`Faculdade/Trabalhos` vira `/files/list/Faculdade%2FTrabalhos`.

[`routes/list.js`](../../controller/routes/list.js) usa `Directory.resolvePath()`
e retorna `200` com o conteúdo imediato da pasta, sem links simbólicos:

```json
{
  "files": [{ "filename": "texto.txt", "mimeType": "application/octet-stream", "size": 12, "lastModified": "2026-11-18T12:00:00.000Z" }],
  "directories": [{ "name": "Trabalhos" }]
}
```

Caminho inválido ou que aponta para arquivo recebe `400`; pasta inexistente,
`404`; tentativa de sair da raiz ou falta de permissão, `403`.

### `POST /files/upload`

Ao clicar em **Enviar arquivo à raiz** e escolher um arquivo, a interface converte
seu conteúdo para Base64. `fetcher.uploadFile(file)` → `uploadFile(apiUrl, file, peerId)`,
em [`fetchers/upload.js`](../../controller/fetchers/upload.js), envia:

```json
{ "filename": "texto.txt", "mimeType": "text/plain", "data": "b2xh" }
```

[`routes/upload.js`](../../controller/routes/upload.js) usa `File.isValidFilename()`,
`File.fromBase64()` e `Directory.getSharedDir()`. Grava sempre na raiz compartilhada
do alvo, mesmo quando a interface exibe um subdiretório. Após o envio, a View lista a raiz.

Retorna `201` com `{ filename, mimeType, size, downloadUrl }`. `mimeType` é opcional
no pedido e usa `application/octet-stream` por padrão. O nome aceita até 255
caracteres ASCII: começa com letra ou número e continua com letras, números,
ponto, hífen ou sublinhado. Dados inválidos recebem `400`, arquivo existente
recebe `409` e conteúdo acima de 100 MiB (`100 * 1024 * 1024` bytes) recebe `413`.
O parser JSON também limita o corpo a `134mb` para acomodar o Base64.

### `GET /files/download/:path`

Ao solicitar o download de um arquivo listado, `fetcher.downloadFile(filePath)` →
`downloadFile(apiUrl, filePath, peerId)`, em
[`fetchers/download.js`](../../controller/fetchers/download.js), codifica o caminho
relativo completo. Exemplo: `/files/download/Faculdade%2Ftexto.txt`.

[`routes/download.js`](../../controller/routes/download.js) chama
`Directory.resolvePath()`, lê o arquivo e usa `File.toBase64()`. Retorna `200` com
`{ filename, mimeType, size, data }`; `filename` é apenas o nome e `data` contém
Base64. O fetcher cria um `Blob` e aciona o download no navegador. O MIME retornado
usa `application/octet-stream`.

Caminho inválido ou diretório recebe `400`; arquivo inexistente, `404`;
tentativa de sair da raiz ou falta de permissão, `403`.

## Página de referência — `GET /api`

Ao abrir `/api` diretamente no endereço da API, o handler de
[`controller/index.js`](../../controller/index.js) serve
[`view/pages/index.html`](../../view/pages/index.html) com `sendFile()`.
**Acesso público. Não possui fetcher:** a navegação é feita pelo navegador.
