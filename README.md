# Passa Arquivo

## Execução

A API fica em `controller/` e a interface React/Vite fica em `view/`.
As dependências e os scripts das duas partes estão no `package.json` da raiz.
Execute os comandos abaixo a partir da raiz do repositório:

```bash
npm install
npm run api
```

O script `npm run api` executa `controller/index.js` diretamente no Node.js, sem etapa de build,
e usa o diretório de arquivos definido por `UPLOAD_DIR` no próprio script.
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

## Informações de rede

`model/Network.js` exporta uma única instância da classe `Network`, compartilhada
pelos módulos que a importam no mesmo processo. O método `obtainCidrs()` atualiza
as sub-redes IPv4 locais no atributo `cidrs`. Esse atributo é somente leitura
para quem usa a instância, e os elementos da lista também são protegidos contra
alterações externas. A instância obtém os CIDRs antes de ser exportada.

A classe consulta a rede; a configuração do Vite insere uma cópia dos CIDRs no
código da interface. O navegador não importa a classe, que depende de Node.js.
A descoberta pesquisa exclusivamente essas sub-redes. Se a lista estiver vazia,
retorna uma lista vazia de APIs, sem fazer requisições de descoberta. Não há
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
que representa a máquina atual. O nome inicial fica pendente de quem chamar o
construtor; deve ter de 1 a 15 caracteres, sem espaços ou outros caracteres de
espaçamento. A API instancia `Peer` com o nome inicial definido em
`controller/index.js`; ainda não há uma tela para defini-lo.

```js
import Peer from "./model/Peer.js";

const peer = new Peer("MeuPC"); // Nome obrigatório somente na primeira execução.
console.log(peer.nome, peer.ip, peer.id);
console.log(new Peer() === peer); // true

// A identidade abaixo deve vir do outro dispositivo, incluindo o UUID dele.
peer.appendPeer({ nome: "OutroPC", ip: "192.168.1.20", id: "e3743d67-6215-4b5d-a67c-31a45ee4f60a" });
const peers = peer.getPeers();
peer.updatePeer(peers[0].id, { nome: "Notebook", ip: "192.168.1.30" });
peer.removePeer(peers[0].id);
```

Na primeira criação, `randomUUID()` gera o id e a classe salva `nome`, `ip` e `id`
em `model/identity.json`. Nas próximas execuções, nome e id vêm desse arquivo,
mesmo que outro nome seja passado ao construtor. Apenas o IP é obtido novamente
de `network.getIps()[0]`, após atualizar as interfaces, e salvo no JSON.
`peer.nome = "NovoNome"` valida e persiste uma alteração de nome. O id não pode
ser alterado. O JSON é ignorado pelo Git para não distribuir a identidade de uma
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
A descoberta lê esse JSON e envia a identidade para `POST /peer` na API
local. Essa rota chama `peer.savePeer(identity)`: um id novo é cadastrado; um id
existente com outro IP tem somente o IP atualizado, preservando nome e id. Se o
IP também for igual, o arquivo não é reescrito. O cadastro ainda não implementa
pareamento ou autenticação de dispositivos.

Somente após a confirmação da gravação (`204`), a descoberta adiciona a URL à
interface e ao `localStorage`. Respostas sem identidade são ignoradas; falhas na
gravação interrompem a busca e chegam à interface como erro.

O navegador envia o cadastro diretamente ao endereço completo da API local,
sem proxy. O Vite insere esse endereço em `import.meta.env.LOCAL_API_URL`, usando
`HOST` e `PORT` quando definidos, ou o primeiro IPv4 local e a porta 3000.
Quando `HOST` é `0.0.0.0`, usa o IPv4 local como destino do navegador.
A API precisa estar em execução; o CORS já configurado permite a requisição
da interface. O endereço fica definido na inicialização do Vite ou na build:
ao trocar de rede, reinicie o servidor de desenvolvimento ou gere outra build.

`npm test` verifica o Singleton, a persistência, as validações e as operações no
CSV usando arquivos temporários, além das rotas HTTP e do fluxo de descoberta.

## CORS

A API usa o middleware `cors` em `controller/index.js` para permitir que páginas de qualquer
origem leiam suas respostas. A configuração anuncia os métodos `GET`, `POST` e
`OPTIONS` e o cabeçalho `Content-Type`. O middleware responde automaticamente às
consultas prévias do navegador (preflight) com status `204`.

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
