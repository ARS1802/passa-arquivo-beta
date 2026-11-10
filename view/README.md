# React + Vite

Esta pasta contém a interface web. O `package.json` e o `package-lock.json`
compartilhados com a API ficam na raiz do repositório. Execute `npm install`,
`npm run dev`, `npm run build`, `npm run preview` e `npm run lint` a partir da raiz;
os scripts da interface entram automaticamente em `view/`.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Descoberta de APIs

Em **Configurar API → Procurar APIs na rede**, a GUI testa `GET /` na porta 3000,
usando as sub-redes IPv4 reais detectadas por `node ip.js` antes da inicialização
do Vite. A configuração é carregada em runtime por `local-network.json`, sem
depender de variáveis injetadas pelo Vite. Cada resposta 200 atualiza imediatamente a lista exibida e
compartilhada (`api.apiUrl`), o `localStorage` e o arquivo `api/peers.csv`, sem duplicatas.
O CSV tem somente a coluna `url`, por exemplo `http://192.168.0.10:3000`:
ela já reúne protocolo, IP e porta. O arquivo registra descobertas; a lista inicial
da GUI continua sendo carregada do `localStorage`.

A gravação usa `POST /api/peers.csv?url=...` no servidor Vite (`vite.config.js`),
com `npm run dev` ou `npm run build` seguido de `npm run preview`. O arquivo fica
na máquina desse servidor. Hospedar somente os arquivos de `dist` não oferece essa
gravação. Falhas ao salvar interrompem a busca com uma mensagem na interface;
as URLs já adicionadas à lista são preservadas.
