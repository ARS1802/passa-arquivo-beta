# Passa-Arquivo

Compartilhamento de arquivos entre computadores na mesma rede local, via IPv4,
com interface React/Vite e API Express. Permite descobrir peers, compartilhar
um diretório, navegar por subdiretórios, enviar e baixar arquivos.

## Executar

Requer Node.js 20.19+ na série 20 ou 22.12+ e npm. Execute na raiz do projeto:

```bash
npm install
npm start
```

Em outro terminal, inicie a interface:

```bash
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173) na própria máquina.
A API usa o primeiro IPv4 local e a porta `3000` por padrão.
Repita a execução nos computadores que participarão do compartilhamento.

Para configurar a porta da interface, copie [`.env.example`](.env.example) para
`.env`, ajuste `VITE_PORT` e reinicie API e Vite.

Comandos adicionais, definidos em [`package.json`](package.json):

| Comando | Finalidade |
| --- | --- |
| `npm test` | Executar os testes. |
| `npm run lint` | Verificar o código da interface. |
| `npm run build` | Gerar a interface em `view/dist/`. |
| `npm run preview -- --port 5173` | Servir a build; use a mesma porta de `VITE_PORT` e mantenha a API ativa. |

## Documentação

- [P2P: descoberta, identidade e persistência](docs/architecture/P2P.md).
- [MVC: responsabilidades e arquivos principais](docs/architecture/MVC.md).
- [API: rotas e fetchers no fluxo de uso](docs/api/routes.md).
- [Segurança: restrições atuais e limitações](docs/api/security.md).

Pareamento por certificados está previsto. A documentação por tela será definida
em `docs/ui/`, mantido vazio enquanto a interface estiver em revisão.
