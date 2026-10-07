# Fluxo Interno — contexto do projeto

> Este arquivo existe para quem (pessoa ou IA) retoma o desenvolvimento em outra
> máquina. Ele é carregado automaticamente pelo `CLAUDE.md`. Atualize-o quando o
> estado mudar.

## O que é

Sistema **interno** de chamados/fluxos no estilo Pipefy (quadros kanban, fases,
campos personalizados, formulário público, e-mails, relatórios), feito para uso
da própria empresa (grupo Ambientec/Biocoletas/Colemax/Colenorte/Colefar, coleta
de resíduos). **Não será vendido**: não propor multi-tenant nem SaaS.

- Stack: Next.js 16 (App Router, **com mudanças que quebram o que você conhece** —
  leia `node_modules/next/dist/docs/` antes de escrever código de Next), React 19,
  TypeScript, Drizzle ORM + PostgreSQL 17, Tailwind 4 + shadcn/Radix, Vitest.
- Pastas: `src/app` (rotas e server actions), `src/lib` (regras; `dal.ts` é a
  camada de acesso a dados e de permissões), `src/components`, `src/db` (schema),
  `drizzle/` (migrações), `scripts/` (utilitários), `docs/`.
- Testes: `npm test` · tipos: `npm run typecheck` · lint: `npm run lint`.

## Como rodar em casa

```bash
git clone <este repositório> && cd fluxo-interno
npm ci
cp .env.example .env          # preencha POSTGRES_PASSWORD e o resto
docker compose up -d db       # PostgreSQL 127.0.0.1:5432 (precisa do Docker)
npm run db:migrate            # cria as tabelas
npm run db:seed               # SÓ em desenvolvimento: admin@fluxo.local / senha do seed
npm run dev                   # http://localhost:3000
```

Em produção **nunca** use `db:seed` (a senha é pública); use
`scripts/bootstrap-admin.ts` (ver `DEPLOY.md`).

### Os dados reais NÃO estão no repositório

O repositório é público. Ficam de fora (e no `.gitignore`): `.env`, `uploads/`
(anexos dos clientes), `backups/`, planilhas `.xlsx` do Pipefy e relatórios de
importação. Para ter os dados reais em casa:

1. **Backup do banco e dos anexos** com `scripts/backup.sh` (ver `DEPLOY.md`) e
   levar o arquivo por um meio privado (pendrive, nuvem privada) — nunca pelo Git;
   restaurar com `scripts/restore-db.sh`.
2. Ou reimportar do Pipefy: `npm run import:pipefy -- <relatorio.xlsx>` (as
   planilhas `chamados_*.xlsx` e `envio_semanal_para_consultores_*.xlsx`; os
   mapeamentos estão em `scripts/pipefy-mappings/`). Os links de anexo do Pipefy
   expiram ~30 dias após a exportação.

Sem dados reais ainda dá para desenvolver: os testes usam dados fictícios e o
seed cria um quadro de demonstração.

## Dados que existiam na máquina de trabalho (referência)

Quadros importados: `atendimento` (demonstração), `chamados-ti` (1.606 cards),
`analise-de-contratos` (10.253 cards, **privado**, tem CPF/CNPJ de clientes,
8.509 anexos). Usuários da equipe ainda não foram criados (o importador ignora
"Responsáveis" porque não são usuários cadastrados).

## Implantação (plano decidido)

Servidor **Dell T140 dedicado** (hoje Windows Server), IP fixo, **sem domínio
ainda**. Ubuntu direto no T140 ou VM Ubuntu no Hyper-V (Docker Desktop não roda
em Windows Server). Port-forward 80/443 + Caddy; **sem Cloudflare Tunnel**.
Formulários públicos (`/f/<chave>`) abertos para a internet; login, quadros e
admin só pela rede interna/VPN (`INTERNAL_NETS`). Passo a passo em `DEPLOY.md`.
Quadros com dados pessoais (RH, contratos, financeiro) entram como **privados**.

## Estado do desenvolvimento

Pronto e testado (272 testes): quadros kanban com arrastar e soltar, campos
personalizados, formulário público (honeypot + rate limit), e-mails
(modelos, automações, fila, worker SMTP), relatórios com CSV, anexos (imagem,
vídeo, PDF e Office verificados pelo conteúdo), painel admin, login com
bloqueio por tentativas, importador do Pipefy, backup/restore, Docker/Caddy, e o
**gerador de contratos em PDF** (ver `docs/GERADOR-DE-CONTRATOS.md`).

Pendências, em ordem de valor:

1. **Gerador de contratos — Classe II** (132 cards): único modelo que falta.
   Ver o documento do gerador.
2. **Campos condicionais** no formulário e no card (o botão "Condicionais em
   campos" ainda é só visual): o formulário de contratos tem 63 campos, vários
   "SE SIM, informe…".
3. **Usuários e responsáveis**: criar a equipe (TI: Silvana Queiroz, Bruna Araújo…)
   e atribuir; adicionar membros ao quadro privado de contratos.
4. **Relatório de tempo por fase** (o histórico importado permite medir).
5. **Desempenho**: o quadro de 10 mil cards leva 3–4,5 s em produção (16 s em
   desenvolvimento); o banco responde em < 0,5 s — dá para carregar menos cards
   por fase e valores de campo sob demanda.
6. **Servidor**: preparar o T140, registrar domínio, SMTP real, seguir o
   `DEPLOY.md`, levar os dados por backup/restore.
7. Lacunas do importador: checklists, conexões entre pipes, automações, modelos
   de e-mail e permissões do pipe não vêm no relatório do Pipefy e precisam ser
   recriados à mão. Anexos recusados na importação: 134 `.html`, 1 `.xlsm`,
   1 `.msg`, 1 `.xlsx` > 10 MB, 2 `.docx` com objeto OLE embutido.

## Convenções

- **Nunca commitar dado de cliente real**: nem em teste, nem em exemplo, nem em
  comentário. Os testes usam nomes, CPFs e e-mails inventados. Há uma varredura
  simples no fim do `docs/GERADOR-DE-CONTRATOS.md`.
- Contrato é documento jurídico: **não corrigir redação** das cláusulas (mesmo
  com erro de português evidente). Quem decide o texto é o jurídico.
- Comentários e mensagens em português, no estilo do código vizinho.
- Commits só quando o dono do projeto pedir.
- Em Windows, cuidado ao gerar arquivos por script: `\b` num literal Python
  vira caractere de controle; prefira strings *raw* ou `chr(92)`.
