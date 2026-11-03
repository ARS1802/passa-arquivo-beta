# Passa Arquivo

## Upload

Envie o conteúdo bruto do arquivo usando `filename` na query string ou o header
`x-file-name`:

```bash
curl -X POST \
  -H "Content-Type: application/octet-stream" \
  --data-binary @documento.pdf \
  "http://localhost:3000/files/upload?filename=documento.pdf"
```

O endpoint retorna `201` com o nome, o tamanho e a URL de download. Arquivos
maiores que 100 MB são rejeitados e um arquivo existente não é sobrescrito.

## Download

```bash
curl -OJ http://localhost:3000/files/download/documento.pdf
```
