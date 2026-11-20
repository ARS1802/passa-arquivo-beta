# MVC: responsabilidades e arquivos principais

[README](../../README.md) · [P2P](P2P.md) · [Rotas](../api/routes.md)

O fluxo parte de uma ação na View: ela chama `fetcher`, que envia a requisição
ao Controller. A rota usa o Model e devolve dados para a interface atualizar a tela.
Os módulos de `controller/fetchers/` executam no navegador; os Models executam no Node.js.

## Model — `model/`

Concentra identidade, cadastro de dispositivos, informações de rede e regras
para arquivos e diretórios. Quando o usuário escolhe uma pasta ou encontra um peer,
a rota recorre ao Model para validar e manter esse estado.

| Arquivo | Papel no fluxo |
| --- | --- |
| [`Peer.js`](../../model/Peer.js) | Mantém a identidade local e o cadastro persistente. `getPeers()` lista registros, `savePeer()` incorpora identidades descobertas, `removePeer()` exclui um cadastro e `isRegistered()` verifica o UUID recebido nas operações de arquivos. O setter `nome` salva a renomeação local. |
| [`Network.js`](../../model/Network.js) | Exporta a instância `network`. `obtainCidrs()` e `getIps()` fornecem as faixas e os IPv4 usados na descoberta e inicialização. Carrega `VITE_PORT` e fornece `requireLocalVite`, usado pelas rotas de administração local. |
| [`Directory.js`](../../model/Directory.js) | `setSharedDir()` valida a pasta escolhida e atualiza `SHARED_DIR`; `getSharedDir()` exige uma pasta configurada. `resolvePath()` resolve caminhos relativos e impede sair da raiz compartilhada. Instâncias representam as pastas retornadas na listagem. |
| [`File.js`](../../model/File.js) | Representa conteúdo em `Buffer`. `fromBase64()` e `toBase64()` fazem a conversão usada nas transferências; `isValidFilename()` valida nomes de upload e `MAX_FILE_SIZE` define o limite de 100 MiB. |

## Controller — `controller/`

Recebe as requisições HTTP, aplica as verificações de acesso e coordena o uso do
Model. Os fetchers oferecem à View os métodos para chamar essas rotas e tratar
as respostas, tanto na API local quanto na API do dispositivo selecionado.

| Arquivo ou conjunto | Papel no fluxo |
| --- | --- |
| [`index.js`](../../controller/index.js) | Inicia o Express e o peer local, configura JSON/CORS, registra rotas, valida `SHARED_DIR` inicial e trata erros. Também serve a página HTML em `GET /api`. |
| [`routes/identity.js`](../../controller/routes/identity.js) | Consulta a identidade e recebe o nome salvo pelo usuário. |
| [`routes/peers.js`](../../controller/routes/peers.js) | Lista, cadastra e exclui dispositivos; encaminha essas operações para `Peer`. |
| [`routes/dir.js`](../../controller/routes/dir.js) | Consulta e altera o diretório compartilhado da própria máquina. |
| [`routes/files.js`](../../controller/routes/files.js) | Verifica `X-Peer-Id` com `peer.isRegistered()` e reúne as rotas de listagem, upload e download. Essas rotas usam `Directory` e `File`; a leitura e a escrita efetivas dos arquivos ainda estão nos handlers. |
| [`fetchers/Fetcher.js`](../../controller/fetchers/Fetcher.js) | Exporta a classe `Fetcher` e a instância `fetcher` usada pela View. Coordena os fetchers menores, a descoberta, a seleção do alvo, o cache e a restauração da pasta. Identidade, peers e pasta usam a API local; arquivos usam `targetPeerURL` e recebem automaticamente `X-Peer-Id`. |

O cadastro está fisicamente em `controller/peers.csv`, mas sua leitura e escrita
pertencem a `Peer`. Veja os contratos e fetchers por endpoint em [rotas](../api/routes.md).

## View — `view/`

A interface React/Vite conduz a escolha de nome, pasta e peer, seguida da navegação
e transferência de arquivos. Sua organização ainda está sujeita a mudanças.

- [`src/main.jsx`](../../view/src/main.jsx) monta o React; [`src/App.jsx`](../../view/src/App.jsx) consulta a identidade e exige o nome antes de liberar o fluxo.
- [`src/pages/FileListPage.jsx`](../../view/src/pages/FileListPage.jsx) coordena as telas e ações de arquivos, usando componentes de `src/components/` e a instância `fetcher`.
- [`vite.config.js`](../../view/vite.config.js) configura a porta e insere o endereço da API local e as faixas IPv4 no código do navegador.

`docs/ui/` permanece vazio até a definição da documentação por tela.
