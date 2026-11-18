# Passa Arquivo

## Execução

A API fica em `controller/` e a interface React/Vite fica em `view/`.
As dependências e os scripts das duas partes estão no `package.json` da raiz.
Execute os comandos abaixo a partir da raiz do repositório:

```bash
npm install
npm start
```

O script `npm start` executa `controller/index.js` diretamente no Node.js, sem etapa de build.
O diretório compartilhado é escolhido pela interface, sem um caminho fixo no script.
Em outro terminal, inicie a interface:

```bash
npm run dev
```

Esse comando inicia o Vite em `view/`. Durante a inicialização, sua configuração usa
`model/Network.js` para obter as sub-redes e inseri-las no JavaScript da interface.
A interface consome a API por HTTP; o servidor da API continua
responsável somente por seus endpoints.

`npm run build` gera a interface em `view/dist/`, e `npm run preview` serve essa
versão compilada. `npm run lint` verifica o código da interface.
A descoberta lê as sub-redes de `import.meta.env.LOCAL_NETWORK_CIDRS`, preenchido
pelo `define` do Vite. Essas informações de rede não exigem arquivo ou rota próprios.

## Diretório compartilhado

Após confirmar o nome deste Peer, a interface abre a tela `SelectDir.jsx`.
O botão **Escolher diretório** usa
`showDirectoryPicker()` no navegador, quando disponível. Essa API fornece um
handle e o nome da pasta, mas não seu caminho absoluto. Por isso, informe o
**Caminho absoluto** e clique em **Compartilhar diretório** para enviar o endereço
à API. Também é possível informar diretamente o caminho, inclusive para pastas vazias.
O picker não envia arquivos nem inicia processos no servidor.

`model/Directory.js` concentra a consulta, validação e atualização de `SHARED_DIR`
nos métodos estáticos `getSharedDir()` e `setSharedDir()`.

Todas as rotas abaixo usam `network.requireLocalVite`, o mesmo middleware de
consulta e exclusão de peers. A conexão e a origem devem pertencer ao Vite local,
mesmo quando o Peer selecionado na interface é remoto.

- `GET /dir`: retorna `{ "SHARED_DIR": "/caminho/da/pasta" }`, ou `null` no campo quando não configurado.
- `POST /dir`: recebe `{ "SHARED_DIR": "/caminho/da/pasta" }`. Confirma que o caminho é absoluto, existe e é um diretório. Somente então atualiza `process.env.SHARED_DIR` e retorna o caminho real.

Um caminho inválido ou que aponta para um arquivo retorna `400`; uma pasta
inexistente retorna `404`. Falhas preservam o diretório anterior. As rotas de
listagem, upload e download leem o valor atualizado a cada requisição. Sem uma
pasta configurada, retornam `409`, sem criar ou compartilhar uma pasta padrão.
Também é possível fornecer `SHARED_DIR` no ambiente ao iniciar a API; esse caminho
passa pela mesma validação.

Após a confirmação, a classe `API` salva `SHARED_DIR` na mesma `LOCAL_STORAGE_KEY`
dos peers. Ao abrir a tela, consulta a API: se ela reiniciou sem diretório, reenvia
a escolha salva para validação. Se a pasta foi removida, a tela pede uma nova escolha
por meio da mensagem de erro. O valor do ambiente pertence ao processo da API;
a GUI consulta esse processo por HTTP, sem uma cópia estática em `import.meta.env`.

## Informações de rede

`model/Network.js` exporta uma única instância da classe `Network`, compartilhada
pelos módulos que a importam no mesmo processo. O método `obtainCidrs()` atualiza
as sub-redes IPv4 locais no atributo `cidrs`. Esse atributo é somente leitura
para quem usa a instância, e os elementos da lista também são protegidos contra
alterações externas. A instância obtém os CIDRs antes de ser exportada.

A classe consulta a rede; a configuração do Vite insere uma cópia dos CIDRs no
código da interface. O navegador não importa a classe, que depende de Node.js.
A descoberta pesquisa exclusivamente essas sub-redes. Se a lista estiver vazia,
retorna uma lista vazia de Peers, sem fazer requisições de descoberta. Não há
detecção por WebRTC, faixas predefinidas ou parâmetro para fornecer outras faixas.

Os valores representam a rede da máquina que executou o Vite. Ao trocar de rede,
reinicie `npm run dev` ou gere outra build. Uma build distribuída para outra
máquina mantém os CIDRs de onde foi gerada; `npm run preview` não os atualiza.

## Modelo de arquivo

`model/File.js` contém a classe `File` utilizada pelas rotas de upload, download
e listagem da API. Ela representa o conteúdo com `Buffer` e oferece conversão
entre esse conteúdo e Base64. As rotas de upload e download verificam os nomes
recebidos com `File.isValidFilename`.

A interface em `view/` envia e recebe objetos JSON por HTTP, sem instanciar essa
classe. Os módulos de `controller/fetchers/` fazem as requisições e tratam suas respostas.

## Identidade e cadastro de peers

`model/Peer.js` exporta a classe `Peer`, exclusiva do Node.js. Ela é um Singleton:
todas as chamadas a `new Peer()` no mesmo processo retornam a mesma instância,
que representa a máquina atual. A API pode iniciar sem nome: a interface consulta
`GET /` usando `import.meta.env.LOCAL_API_URL` e abre `NamingScreen.jsx` quando o
nome estiver ausente ou nulo. É obrigatório salvar um nome para acessar as demais
telas. O nome deve ter de 1 a 15 caracteres, sem espaços ou outros caracteres de
espaçamento. Quando já existe, o fluxo segue para o diretório compartilhado; o
botão **Alterar meu nome**, na tela de arquivos, permite abrir a tela opcionalmente.
Falhas ao consultar a identidade oferecem uma nova tentativa, sem liberar o fluxo.

```js
import Peer from "./model/Peer.js";

const peer = new Peer(); // O nome será escolhido pela interface.
console.log(peer.nome, peer.ip, peer.id);
console.log(new Peer() === peer); // true

// A identidade abaixo deve vir do outro dispositivo, incluindo o UUID dele.
peer.appendPeer({ nome: "OutroPC", ip: "192.168.1.20", id: "e3743d67-6215-4b5d-a67c-31a45ee4f60a" });
const peers = peer.getPeers();
peer.updatePeer(peers[0].id, { nome: "Notebook", ip: "192.168.1.30" });
peer.removePeer(peers[0].id);
```

Na primeira criação, `randomUUID()` gera o id e a classe salva `ip` e `id`
em `model/identity.json`; `nome` pode ficar ausente até a escolha do usuário.
Nas próximas execuções, nome e id vêm desse arquivo. Apenas o IP é obtido novamente
de `network.getIps()[0]`, após atualizar as interfaces, e salvo no JSON.
Os getters `nome`, `ip` e `id` leem o arquivo a cada acesso e atualizam os atributos
privados correspondentes. `peer.nome = "NovoNome"` lê a identidade atual, valida e
persiste apenas a alteração do nome, preservando os demais campos. O id não possui
setter. O JSON é ignorado pelo Git para não distribuir a identidade de uma
máquina às demais. Um JSON inválido ou a ausência de IPv4 causa erro sem substituir
a identidade existente.

Os outros peers são registros simples em `controller/peers.csv`, com cabeçalho
`nome,ip,id`. `getPeers()` lê os registros, `appendPeer()` acrescenta um registro e
rejeita ids repetidos, `updatePeer(id, { nome, ip })` permite alterar somente nome
e/ou IP, e `removePeer(id)` exclui pelo id. Atualizar ou excluir um id ausente
retorna `false`; quando a operação é realizada, retorna `true`. Erros de validação
lançam exceções sem alterar o cadastro. Os caminhos são relativos ao módulo,
independentemente da pasta em que o programa é executado.

A rota `GET /` retorna o conteúdo de `model/identity.json`, com nome, IP e id.
A rota `POST /` recebe somente `{ "nome": "MeuPC" }` e retorna a identidade
atualizada. Usa `network.requireLocalVite`: apenas a conexão e a origem do Vite
local são aceitas. Nomes inválidos e campos adicionais retornam `400`; acessos
fora dessa restrição retornam `403`. A alteração preserva IP e UUID.
O fetcher `controller/fetchers/naming.js` é usado por `api.getLocalIdentity()` e
`api.setLocalName(nome)`, sempre na API local, independentemente do Peer selecionado.

A descoberta lê esse JSON e envia a identidade para `POST /peer` na API
local. Essa rota chama `peer.savePeer(identity)`: um id novo é cadastrado; um id
existente com outro IP tem somente o IP atualizado, preservando nome e id. Se o
IP também for igual, o arquivo não é reescrito. O cadastro ainda não implementa
pareamento ou autenticação de dispositivos.

`GET /peer` retorna `{ "peers": [...] }` com os registros do CSV (ou um array
vazio quando não há cadastros). O acesso exige uma conexão da própria máquina
e o cabeçalho `Origin` do Vite local: HTTP na porta `VITE_PORT`, usando `localhost`,
loopback ou um IPv4 da máquina. Outras origens, conexões remotas e requisições
sem `Origin` recebem `403`. O Vite usa a porta configurada e falha se ela estiver
ocupada, em vez de escolher outra porta. O preview só terá acesso se usar essa mesma porta.
Essa verificação restringe o acesso do navegador e da rede; não autentica
processos locais, que podem imitar o cabeçalho `Origin`.

`DELETE /peer/:id` aplica a mesma restrição de conexão e origem local. Chama
`peer.removePeer(id)` e retorna `204` quando exclui o registro, `404` quando o
id não existe e `400` para um id inválido.

Para configurar a porta, copie `.env.example` para `.env` na raiz e altere
`VITE_PORT=5173`. Sem configuração, o padrão é 5173. Variáveis definidas no
ambiente do processo têm prioridade sobre o `.env`. Reinicie a API e o Vite
depois de alterar a porta.

`model/Network.js` carrega e valida o mesmo valor para os processos Node.js pelo
método privado `#exportVitePort()`, chamado no construtor. Controller e Model
podem importar `network` desse arquivo e acessar `network.vitePort`, somente
para leitura; após seu carregamento, o valor
também está em `process.env.VITE_PORT`. O `view/vite.config.js` usa esse valor
para iniciar o servidor e disponibiliza `import.meta.env.VITE_PORT` (string) aos
módulos da View. A View não deve importar `Network.js`, pois ele depende de Node.js.

A descoberta consulta os endereços em paralelo com `Promise.all()`, mantendo o
limite de 500 requisições simultâneas e timeout de 1500 ms por requisição.
Depois da gravação (`204`), retorna objetos com `nome`, `ip` e `id`, sem duplicar
o mesmo dispositivo por id. Ao terminar a busca, a classe `API` consulta os
registros salvos e atualiza o cache no `localStorage`. Respostas sem identidade
são ignoradas; falhas na gravação interrompem a busca e chegam à interface como erro.

O navegador envia o cadastro diretamente ao endereço completo da API local,
sem proxy. O Vite insere esse endereço em `import.meta.env.LOCAL_API_URL`, usando
`HOST` e `PORT` quando definidos, ou o primeiro IPv4 local e a porta 3000.
Quando `HOST` é `0.0.0.0`, usa o IPv4 local como destino do navegador.
A API precisa estar em execução; o CORS já configurado permite a requisição
da interface. O endereço fica definido na inicialização do Vite ou na build:
ao trocar de rede, reinicie o servidor de desenvolvimento ou gere outra build.

## Seleção do Peer na interface

`controller/fetchers/API.js` exporta a instância `api`, usada pela View, e a classe
`API`. O atributo `targetPeer` começa como `null`: o usuário escolhe um dispositivo
salvo na tela de Peers. `targetPeerURL` é calculado como `http://<ip>:3000`, ou uma
string vazia enquanto não há alvo. Listagem, download e upload continuam usando
os mesmos fetchers, agora com essa URL; sem alvo, informam que é preciso selecionar
um Peer antes de acessar arquivos.

```js
const discovered = await api.discoverPeers(); // Descobre e salva, sem selecionar.
const saved = await api.getPeer(); // Array de todos os Peers cadastrados na API local.
const peer = await api.getPeer({ nome: "OutroPC" }); // Objeto ou null.
await api.selectPeer({ id: peer.id }); // Seleciona somente esse dispositivo.
const files = await api.listFiles();
await api.setPeerAtLocalStorage(peer.id);
api.removePeerAtLocalStorage(peer.id); // Remove somente a cópia no navegador.
await api.deletePeer(peer.id); // Exclui do cadastro local e do cache.
```

`getPeer({})` também lista todos. Filtros aceitam `nome`, `ip` e/ou `id`; todos os
campos fornecidos devem coincidir. Se houver mais de um resultado, o método pede
um filtro mais específico, como o id. `selectPeer()` exige um filtro e um registro
existente. Consultas e exclusões sempre usam `/peer` da API local, independentemente
do alvo dos fetchers de arquivos.

`LOCAL_STORAGE_KEY` vale `passa-arquivo-peers`. Seu valor no navegador é um objeto
`{ "peers": [...], "SHARED_DIR": "/caminho/da/pasta" }`. O campo `SHARED_DIR` pode
ser `null`. Caches antigos que continham somente um array de peers são migrados
sem perder registros. A lista é atualizada por id ao descobrir, selecionar ou salvar
explicitamente um Peer; alterações nessa lista preservam o diretório salvo.
A API local continua sendo a fonte dos registros; o cache não escolhe o
alvo ao recarregar a página. URLs do formato anterior não são usadas como identidades.
Uma nova descoberta atualiza o IP do alvo se encontrar o mesmo id. Excluir o alvo
limpa a seleção, sem escolher outro automaticamente.

Peers remotos são objetos simples: a classe `model/Peer.js` continua exclusiva
do Node.js e representa apenas a máquina local. A View não instancia essa classe.

`npm test` verifica os fetchers, a descoberta com rede simulada, o cache, a seleção,
as restrições locais de peers e diretórios, a identidade sem nome e sua atualização,
e a troca de pasta nas operações de arquivos.

## CORS

A API usa o middleware `cors` em `controller/index.js` para permitir que páginas de qualquer
origem leiam suas respostas. A configuração anuncia os métodos `GET`, `POST`, `DELETE` e
`OPTIONS` e o cabeçalho `Content-Type`. O middleware responde automaticamente às
consultas prévias do navegador (preflight) com status `204`.
`POST /`, `GET /peer`, `DELETE /peer/:id` e as rotas de `/dir` aplicam a restrição adicional
descrita acima e só liberam a origem local aceita; o CORS geral não concede acesso a essas rotas.

## Upload

Envie um JSON com o nome do arquivo e seu conteúdo em Base64:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"filename":"documento.pdf","data":"<conteudo-em-base64>"}' \
  http://<ip-da-maquina>:3000/files/upload
```

O endpoint retorna `201` com o nome, o tamanho e a URL de download. Arquivos
maiores que 100 MB são rejeitados e um arquivo existente não é sobrescrito.

## Download

```bash
curl http://<ip-da-maquina>:3000/files/download/documento.pdf
```

A resposta contém `filename`, `size` e `data` em Base64.

## Estrutura

- `controller/index.js`: inicialização da API.
- `controller/routes/`: rotas HTTP.
- `model/`: modelo de arquivo e detecção da rede local.
- `model/utils/`: utilitários da API.
- `view/src/`: interface React.
- `controller/fetchers/`: comunicação da interface com as APIs.
- `view/pages/`: página HTML de documentação.
