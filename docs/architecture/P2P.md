# P2P: descoberta, identidade e persistência

[README](../../README.md) · [MVC](MVC.md) · [Rotas](../api/routes.md) · [Segurança](../api/security.md)

Cada computador executa sua API e sua interface. Ao selecionar um peer, o navegador
acessa diretamente a API desse dispositivo para listar, enviar e baixar arquivos.
Identidade, diretório compartilhado e cadastro de peers são administrados na API local.

## Identidade do peer

Ao iniciar a API, [`Peer`](../../model/Peer.js) representa a máquina local como
uma instância única por processo. Os outros dispositivos são registros
`{ nome, ip, id }`, sem instâncias próprias dessa classe.

- `id`: UUID criado por `randomUUID()` na primeira execução; permanece após reinícios e mudanças de rede.
- `nome`: escolhido antes de acessar as demais telas; aceita de 1 a 15 caracteres, sem espaços. A implementação permite alterá-lo pelo setter `peer.nome`.
- `ip`: primeiro IPv4 retornado por `network.getIps()`; é atualizado na inicialização da API.

O UUID identifica o dispositivo mesmo quando seu IP muda. Ele ainda não é um
certificado: descoberta e cadastro não implementam pareamento autenticado.

## Descoberta, passo a passo

Quando o usuário clica em **Procurar Peers na rede**, em
[`ApiUrlConfig.jsx`](../../view/src/components/ApiUrlConfig.jsx), a interface chama
`fetcher.discoverPeers()`. O algoritmo está em
[`controller/fetchers/peers.js`](../../controller/fetchers/peers.js):

1. Antes da busca, `network.obtainCidrs()`, em [`Network.js`](../../model/Network.js), consulta as interfaces IPv4 não internas. O CIDR contém o IP e o prefixo da sub-rede; por exemplo, `192.168.1.20/24` delimita a faixa `192.168.1.0–192.168.1.255`. Conhecer essa faixa evita pesquisar endereços de outras redes.
2. Ao iniciar o Vite ou gerar a build, [`vite.config.js`](../../view/vite.config.js) insere essa lista em `import.meta.env.LOCAL_NETWORK_CIDRS`. O navegador lê a cópia por `getLocalNetworkCidrs()`; sem faixas, retorna `[]` sem fazer requisições de descoberta.
3. `parseCidr()` calcula o início e o fim de cada faixa. `generateIps()` percorre todos os endereços, inclusive rede e broadcast. As faixas são processadas na ordem recebida.
4. Para cada faixa, `discoverPeers()` executa até **800 tarefas simultâneas**, coordenadas por `Promise.all()`. Cada tarefa consulta `GET http://<ip>:3000/identity`, com timeout padrão de **10 segundos** por requisição.
5. `getIdentity()` ignora falhas de conexão, respostas diferentes de `200` e dados sem o formato de identidade esperado. Um `Map` elimina repetições pelo `id`.
6. `saveIdentity()` envia cada identidade encontrada para `POST /peer` da API local. A rota chama `peer.savePeer()`: cadastra um UUID novo ou atualiza apenas o IP de um UUID conhecido, preservando seu nome. O próprio UUID local é ignorado nessa atualização. A gravação deve responder `204`; falhas interrompem a busca e chegam à interface.
7. Ao concluir uma busca com resultados, `Fetcher.discoverPeers()` relê o cadastro por `getPeer()`, atualiza o cache e, se necessário, o IP do alvo selecionado. A descoberta não seleciona um peer automaticamente.

**Interromper busca** cancela as requisições pelo `AbortSignal` e preserva os
registros já salvos. Durante a busca, a interface consulta o cadastro local
periodicamente para exibir os dispositivos encontrados.

## Seleção e transferência

Ao marcar um dispositivo, `fetcher.selectPeer({ id })` consulta o cadastro local e
define `targetPeer`. [`Fetcher.js`](../../controller/fetchers/Fetcher.js) calcula
`targetPeerURL` como `http://<ip>:3000`. Sem alvo, as operações de arquivos falham
com a solicitação de selecionar um peer.

Para acessar arquivos de B a partir de A, A precisa selecionar B e o cadastro de B
precisa conter o UUID de A. Para transferir nos dois sentidos, execute a descoberta
nos dois computadores. Os fetchers enviam o UUID do solicitante em `X-Peer-Id`;
as limitações dessa verificação estão em [segurança](../api/security.md).

## Persistência

| Estado | Onde fica | Comportamento no uso |
| --- | --- | --- |
| Identidade local | `model/identity.json` | Guarda UUID, nome quando definido e IP. `Peer` preserva UUID/nome e atualiza o IP ao iniciar. O arquivo é ignorado pelo Git. |
| Cadastro de dispositivos | [`controller/peers.csv`](../../controller/peers.csv) | Colunas `nome,ip,id`; o primeiro registro é o dispositivo local. `peer.getPeers()` lê o cadastro; `appendPeer()`, `savePeer()`, `updatePeer()` e `removePeer()` o mantêm. Trocar de rede não apaga os registros. |
| Cache do navegador | `localStorage["passa-arquivo-peers"]` | `Fetcher` guarda `{ peers, SHARED_DIR }`. A API continua sendo a fonte do cadastro. Remover apenas o cache não exclui um peer da API. |
| Diretório compartilhado | `process.env.SHARED_DIR` na API | `Directory.setSharedDir()` valida e altera a pasta. Após reiniciar sem essa variável, `Fetcher.getSharedDir()` reenvia a escolha salva no navegador para validação. |
| Peer selecionado | `Fetcher.targetPeer`, em memória | Recarregar a página exige nova seleção. Excluir o alvo por `fetcher.deletePeer()` limpa a seleção. |

`Peer` resolve os caminhos de persistência a partir do módulo e grava os arquivos
por um temporário seguido de renomeação. O registro local não pode ser excluído
por `removePeer()` nem alterado por `updatePeer()`; a troca do nome usa o setter.

## Configuração de rede

`Network` carrega o `.env` da raiz; variáveis já definidas no processo têm prioridade.
`VITE_PORT` usa `5173` por padrão. A API usa `HOST` ou o primeiro IPv4 local e
`PORT` ou `3000`. O Vite define `LOCAL_API_URL` com esses valores; se `HOST` for
`0.0.0.0`, usa o IPv4 local como destino do navegador.

Ao trocar de rede, reinicie API e Vite. A build preserva o endereço local e os
CIDRs da máquina onde foi gerada; `npm run preview` não os recalcula, exigindo
uma nova build. A descoberta usada pela interface e `targetPeerURL` continuam
usando a porta `3000`, mesmo se `PORT` alterar a porta da API local.
