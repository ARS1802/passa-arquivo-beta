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
pelo `define` do Vite. Nenhum arquivo JSON ou rota adicional é necessário.

## Informações de rede

`model/Network.js` exporta uma única instância da classe `Network`, compartilhada
pelos módulos que a importam no mesmo processo. O método `obtainCidrs()` atualiza
as sub-redes IPv4 locais no atributo `cidrs`. Esse atributo é somente leitura
para quem usa a instância, e os elementos da lista também são protegidos contra
alterações externas. A instância obtém os CIDRs antes de ser exportada.

A classe consulta a rede; a configuração do Vite insere uma cópia dos CIDRs no
código da interface. O navegador não importa a classe, que depende de Node.js.
Se a lista estiver vazia, a descoberta tenta WebRTC e depois sub-redes comuns.

Os valores representam a rede da máquina que executou o Vite. Ao trocar de rede,
reinicie `npm run dev` ou gere outra build. Uma build distribuída para outra
máquina mantém os CIDRs de onde foi gerada; `npm run preview` não os atualiza.

## Modelo de arquivo

`model/File.js` contém a classe `File` utilizada pelas rotas de upload, download
e listagem da API. Ela representa o conteúdo com `Buffer` e oferece conversão
entre esse conteúdo e Base64. As rotas de upload e download verificam os nomes
recebidos com `File.isValidFilename`.

A interface em `view/` envia e recebe objetos JSON por HTTP, sem instanciar essa
classe. Os módulos de `view/api/` fazem as requisições e tratam suas respostas.

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
- `view/api/`: comunicação da interface com as APIs.
- `view/pages/`: página HTML de documentação.
