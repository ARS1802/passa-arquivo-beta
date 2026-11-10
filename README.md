# Passa Arquivo

## Execução

O script `npm start` executa `index.js` diretamente no Node.js, sem etapa de build.
O servidor disponibiliza os endpoints da API e não serve uma interface web.
Uma interface web deve ser servida separadamente e consumir a API por HTTP.

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
