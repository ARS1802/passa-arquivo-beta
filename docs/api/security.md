# Segurança

[README](../../README.md) · [Rotas](routes.md) · [P2P](../architecture/P2P.md)

O acesso atual usa duas verificações: conexão/origem do Vite local nas operações
de administração e UUID cadastrado nas operações de arquivos. Não há pareamento
por certificados nem autenticação criptográfica dos dispositivos.

## Administração pelo Vite local

Quando o usuário altera o nome, consulta ou exclui peers, ou configura a pasta,
as rotas aplicam `network.requireLocalVite`, em [`Network.js`](../../model/Network.js).
O middleware exige simultaneamente:

- `request.socket.remoteAddress` igual a um IPv4 da máquina ou loopback, normalizando o prefixo `::ffff:`.
- `Origin` HTTP com `localhost`, loopback ou IPv4 local e a porta `VITE_PORT` (padrão `5173`).

Requisições remotas, sem `Origin` ou com origem incompatível recebem `403`.
Essa regra cobre `GET /identity`, `POST /identity`, `POST /identity/key/decrypt`,
`GET /peer`, `POST /peer`, `DELETE /peer/:id`, `GET /dir` e `POST /dir`. O Vite usa `strictPort`; o preview deve usar a mesma porta configurada.
Um processo local pode imitar `Origin`, portanto essa verificação não autentica processos.

## Arquivos com `X-Peer-Id`

Quando o usuário lista, envia ou baixa arquivos, [`Fetcher.js`](../../controller/fetchers/Fetcher.js)
consulta a identidade local e envia seu UUID em `X-Peer-Id` à API selecionada.
O middleware de [`routes/files.js`](../../controller/routes/files.js) chama
`peer.isRegistered(id)`, que consulta o CSV do destino linha a linha e encerra a
leitura ao encontrar o registro.

UUID ausente, inválido ou não cadastrado recebe `403`. Falhas de leitura não liberam
o acesso. A regra vale também para acessar os próprios arquivos; por isso, o
cadastro contém o peer local.

## Limites atuais

`GET /`, `POST /identity/key` e `GET /api` são públicos. A descoberta troca
chaves públicas e recebe o ID criptografado para o requisitor, usando RSA-OAEP
com SHA-256 e AES-256-GCM. A descriptografia ocorre somente no backend local;
a chave privada permanece em `controller/.keys/`.

Isso protege o ID nessa resposta, mas não autentica o requisitor: qualquer
dispositivo pode enviar sua própria chave pública e recuperar o ID retornado.
Não há confirmação de pareamento, prova de identidade do recebedor nem proteção
contra repetição. Uma chave já cadastrada para um UUID não é substituída na descoberta.
Conhecer um UUID cadastrado permite enviá-lo em `X-Peer-Id`; o cabeçalho não prova
a identidade de quem faz a requisição. A comunicação atual usa HTTP.

O CORS de [`controller/index.js`](../../controller/index.js) permite qualquer
origem e anuncia `GET`, `POST`, `DELETE`, `OPTIONS`, `Content-Type` e `X-Peer-Id`.
Isso permite a comunicação entre os navegadores e as APIs; as restrições de cada
rota continuam sendo aplicadas. Preflights são respondidos pelo middleware.

Além dessas verificações de acesso, [`Directory.resolvePath()`](../../model/Directory.js)
restringe listagem e download à raiz compartilhada, rejeitando caminhos absolutos,
segmentos `..` e links simbólicos com destino externo. O upload valida o nome com
[`File.isValidFilename()`](../../model/File.js), limita o conteúdo a 100 MiB e usa
escrita exclusiva (`flag: "wx"`) para não sobrescrever arquivos existentes.
