# Passa Arquivo

## Execução

A API fica na raiz do repositório e a interface React/Vite fica em `view/`.
As dependências e os scripts das duas partes estão no `package.json` da raiz.
Execute os comandos abaixo a partir da raiz do repositório:

```bash
npm install
npm start
```

O script `npm start` executa `index.js` diretamente no Node.js, sem etapa de build,
e usa o diretório de arquivos definido por `UPLOAD_DIR` no próprio script.
Em outro terminal, inicie a interface:

```bash
npm run dev
```

Esse comando executa `view/ip.js` para gerar a configuração de rede local e inicia
o Vite em `view/`. A interface consome a API por HTTP; o servidor da API continua
responsável somente por seus endpoints.

`npm run build` gera a interface em `view/dist/`, e `npm run preview` serve essa
versão compilada. `npm run lint` verifica o código da interface.
Veja os detalhes da descoberta de APIs em [view/README.md](view/README.md).

## CORS

A API usa o middleware `cors` em `index.js` para permitir que páginas de qualquer
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
