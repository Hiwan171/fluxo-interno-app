# Fluxo Interno

Sistema interno de chamados e fluxos no estilo Pipefy (quadros kanban, fases,
campos personalizados, formulário público, e-mails, relatórios, importador do
Pipefy) com **gerador de contratos em PDF** a partir dos cards.

Uso interno de uma empresa de coleta de resíduos. Não é um produto: **sem
licença de uso ou redistribuição**. O repositório é público apenas para facilitar
o desenvolvimento; ele **não contém dados de clientes** (os testes usam dados
fictícios).

- Stack: Next.js 16 · React 19 · TypeScript · Drizzle + PostgreSQL 17 ·
  Tailwind 4/shadcn · Vitest · PDFKit.
- **Comece por [`docs/CONTEXTO.md`](docs/CONTEXTO.md)**: o que é, como rodar, estado e
  pendências.
- Gerador de contratos: [`docs/GERADOR-DE-CONTRATOS.md`](docs/GERADOR-DE-CONTRATOS.md).
- Implantação em servidor: [`DEPLOY.md`](DEPLOY.md).

```bash
npm ci
cp .env.example .env        # preencha as senhas
docker compose up -d db     # PostgreSQL local
npm run db:migrate && npm run db:seed   # seed: só em desenvolvimento
npm run dev                 # http://localhost:3000
npm test                    # 272 testes
```
