# Gerador de contratos em PDF

Botão **"Gerar contrato"** no card do quadro *Análise de Contratos*: lê os dados do
card, mostra uma tela de revisão (o que está na tela é exatamente o que vai para o
PDF) e salva o PDF como anexo do card, com registro no histórico.

## Cobertura (medida em 2026-10-07, rodando o gerador nos 10.253 cards)

| | |
|---|---|
| Cards não descartados (sem "Contrato perdido"/"Formulário errado") | 8.703 |
| **Geráveis (sem bloqueio)** | **8.457 (97,2%)**; 98,0% nos criados em 2025-26 |
| Saem prontos, sem completar nada na tela | 5.040 |
| Pedem um ajuste na tela (CEP vazio nos cards de 2021–2023, IE/IM "não informado") | 3.417 |
| Bloqueados | 246 |

Bloqueados: **Classe II ≈ 120**, vigência "Outros"/"6 meses" 33, saúde e
industrial no mesmo card 19, sem mensalidade (valor só por kg) 20, sem tipo de
resíduo 18, só lâmpadas/pilhas 8. Reproduza com
`scripts/contracts-tools/coverage-report.ts`.

## Tipos de contrato (`ContractKind`)

| Tipo | Texto | Observação |
|---|---|---|
| `saude` | `template.ts` | Resíduos de serviço de saúde, 12 meses renovável. Tem tabela de lâmpadas/pilhas e a cláusula 4.5 (animais) opcional |
| `saude_unica` | `template-saude-unica.ts` | Coleta única: 3 meses, preço por coleta, 7 dias + 50% antecipado (opcional) |
| `industrial` | `template-industrial.ts` | Classe I, preço por **período de cobrança** (trimestre, bimestre…) |
| `industrial_unica` | `template-industrial-unica.ts` | Classe I, coleta única |
| `classe_II`, `classe_II_unica` | **não implementado** | A tela bloqueia com "Ainda não há modelo" |

O tipo vem do card (campos "Tipos de resíduos (saúde/industrial)", "Vigência" e
"Frequência"), não é editável na tela.

## Onde está cada coisa (`src/lib/contracts/`)

- `companies.ts` — as 5 empresas (dados da contratada) e os **termos por tipo**
  (`KindTerms`: horário, site do boleto, juros, foro, local de assinatura,
  cargo de quem assina). `KIND_TRAITS` diz o que cada tipo usa.
  `KNOWN_DIVERGENCES` lista o que ainda é suposição.
- `template*.ts` — o texto das cláusulas, extraído dos PDFs assinados, com
  marcadores (`{{campo}}`, `{{{campo}}}` para marcação pronta, `**negrito**`,
  `__itálico__`, `[[link]]`). **Não corrigir a redação.**
- `compose.ts` — junta modelo + empresa + dados revisados num documento
  (`KIND_DEFINITIONS` é o registro de tipos; `buildIntro` monta a abertura).
- `pdf.ts` — desenha o PDF com PDFKit (layout próprio: quebra de linha,
  justificação, órfãs/viúvas, cabeçalho/rodapé com a imagem da empresa).
- `from-card.ts` — card → rascunho + avisos/bloqueios (`buildContractDraft`).
- `normalize.ts` / `words.ts` — normalização (CPF/CNPJ/CEP, UF, endereço,
  frequência, inscrições…) e números por extenso.
- `fields.ts` — tipo `ContractFields` e validação (zod).
- `service.ts` — prepara o rascunho e gera/salva (anexo + evento no histórico).
- `assets.generated.ts` — logos e rodapés em base64 (gerado por
  `node scripts/embed-contract-assets.mjs` a partir de `assets/*.jpg`).
- UI: `src/components/app/contract-dialog.tsx`; ações em
  `src/app/(app)/boards/[boardId]/actions.ts`.
- `next.config.ts` tem `serverExternalPackages: ["pdfkit"]` (o PDFKit lê os
  arquivos de fonte do próprio pacote; já verificado no build `standalone`).

## Fatos descobertos nos contratos reais (importantes)

- **O texto é versionado por DATA, igual para todas as empresas.** Até mai/2026:
  juros "ao mês" e coleta até 17:00. Desde **19/06/2026**: juros "**ao dia**".
  Desde **08/09/2026**: coleta até **18:00** (confirmado em Ambientec, Biocoletas
  e Colenorte; Colemax e Colefar não têm contrato padrão depois dessa data —
  mantido 17:00, **confirmar**). `companies.ts` guarda a versão vigente.
- **O site do boleto é por empresa**: CONTRATANTE na Ambientec e na Colemax;
  CONTRATADA em Biocoletas, Colenorte e Colefar. No industrial, Colenorte e
  Biocoletas dizem CONTRATANTE.
- A cláusula 1.1 diz **sempre "A, B e E"** (504 de 506 contratos), mesmo quando o
  card marca só um grupo — por isso o padrão é sempre os três.
- A frase "50% do valor antecipado" aparece em ~90% das coletas únicas: é opção
  na tela.
- O cargo de quem assina ("Aux. comercial"/"Representante comercial") varia
  dentro da mesma empresa: campo editável.
- Cliente **pessoa física** (CPF de 11 dígitos no lugar do CNPJ) muda a abertura
  ("pessoa física", "inscrita no CPF", sem repetir o CPF do representante) e a
  assinatura ("CPF:").
- O Pipefy copia o celular no campo "Fixo" quando o cliente só tem celular: o
  contrato só imprime "Fixo …" quando é um número diferente.
- Foro é o da empresa, mas contratos isolados trazem o foro do cliente
  (Pirapora/MG, São Paulo/SP).

## Como foi validado (e como validar um modelo novo)

Para cada modelo: gerar o PDF de cards **reais** e comparar, palavra por palavra,
com o contrato **assinado do mesmo cliente** na pasta de contratos.

| Modelo | Cards comparados | Média |
|---|---|---|
| Saúde (5 empresas, Colefar incluída) | 34 | 98,7% |
| Coleta única de saúde | 14 | ~98,5% |
| Coleta única industrial | 14 | 97,7% |
| Industrial Classe I | 28 | 98,1% |

Os valores baixos eram pareamento errado do buscador ou contratos negociados com
cláusulas próprias.

Ferramentas (em `scripts/contracts-tools/`, ver o README de lá):
`index-archive.ps1` → `scan-archive.py` → `extract-template-blocks.py` →
`make-template.py` → `validate-cards.ts` → `validate-match.py`.

### Adicionar um modelo novo (ex.: Classe II)

1. Escolha um contrato assinado recente e digital (Clicksign) de cada empresa.
   Compare com o modelo mais parecido com `diff-contracts.py`.
2. `extract-template-blocks.py <pdf> <blocos.json>` extrai as cláusulas com
   negrito/itálico.
3. Em `make-template.py` acrescente uma entrada em `RULES` com as substituições
   (índice do bloco, trecho exato → marcador); cada regra precisa acertar
   **exatamente uma vez**. Gere o `template-<tipo>.ts`.
4. Registre o tipo em `compose.ts` (`KIND_DEFINITIONS`), os termos de cada empresa
   em `companies.ts` e, se o tipo já existe em `CONTRACT_KINDS`/`KIND_TRAITS`,
   nada mais em `from-card.ts` (a detecção já reconhece Classe II).
5. Escreva testes com dados **fictícios**, rode `validate-cards.ts` +
   `validate-match.py` e confira ≥ 97% nos pareamentos corretos.

## Pendências do gerador

1. **Classe II** (recorrente e coleta única): ~120 cards. Texto próprio, ~90%
   igual ao industrial: objeto "Resíduos de Classes II", cláusula 3.1.5.5 (laudo
   NBR 10.004), sem cláusula de lâmpadas, certificado de destinação (CDF) na 8.1.
   Exemplos na pasta de contratos: Ambientec 34646, Colenorte 32991, Colemax
   33076, Biocoletas 32984 (única).
2. Confirmar o horário **18:00** na Colemax e na Colefar.
3. Frequências não mensais: só "semanal" e "trimestral" (grafia de 2026) foram
   vistas em contrato real; "quinzenal", "bimestral", "semestral" seguem o mesmo
   molde. O contrato industrial da Colenorte (35806) usa uma redação própria
   ("trimestral (de três em três meses)") — pode ser outra edição do modelo.
4. Condicionais marcados "Sim" no card (substituição de contrato 18% dos cards,
   bonificação 10%, particularidade de coleta 5,7%, consignação de bombona
   2,8%): o modelo **não tem texto** para nenhum — hoje só gera um aviso. Falta
   confirmar com o jurídico se o contrato muda.
5. Sem prévia antes de salvar (cada geração vira um anexo) e sem exclusão de
   anexo pela interface.
6. Assinatura digital (Clicksign/Autentique): fora do escopo por enquanto.
7. Divergências a revisar com o jurídico: ver `KNOWN_DIVERGENCES` em
   `companies.ts` (por exemplo, juros de 0,33% **ao dia** ≈ 10% ao mês — parece
   erro, mas é o que está nos contratos vigentes).

## Varredura de dados pessoais (antes de publicar)

```bash
# deve imprimir só "varredura concluída"
python - <<'EOF'
import glob
ruins = ["gmail.com", "hotmail.com"]  # acrescente nomes/CPFs de clientes reais
for f in glob.glob("src/**/*.ts*", recursive=True) + glob.glob("scripts/**/*", recursive=True):
    try: s = open(f, encoding="utf-8").read()
    except Exception: continue
    for r in ruins:
        if r in s: print(f, "->", r)
print("varredura concluída")
EOF
```
