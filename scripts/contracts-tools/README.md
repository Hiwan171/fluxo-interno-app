# Ferramentas do gerador de contratos

Usadas para extrair os modelos dos PDFs assinados e validar o gerador contra
eles. Só funcionam na máquina que enxerga a pasta de contratos
(`Z:\GERAL\CONTRATOS ESCANEADOS\CONTRATOS SCANEADOS`) e o Postgres de
desenvolvimento com os dados importados. Os arquivos intermediários vão para
`scripts/contracts-tools/work/` (ignorado pelo Git — contém dados de clientes).

Requisitos: Python 3.12 com `pymupdf` (`pip install pymupdf`); para PDFs
escaneados, `rapidocr-onnxruntime` (não é necessário para os contratos digitais).

| Passo | Ferramenta | O que faz |
|---|---|---|
| 1 | `index-archive.ps1` | Lista os PDFs da pasta (nome, tamanho, data) → `work/z_index.csv` |
| 2 | `scan-archive.py` | Lê uma **amostra** estratificada e grava o texto → `work/z_full.jsonl`. A rede entrega ~2,3 MB/s: **não leia tudo** (53 GB) |
| 3 | `diff-contracts.py A.pdf B.pdf [limite]` | Compara dois contratos palavra por palavra |
| 4 | `extract-template-blocks.py <pdf> <blocos.json>` | Extrai as cláusulas com negrito/itálico |
| 5 | `make-template.py <blocos.json> <saida.ts> <variante>` | Troca os dados variáveis por marcadores e gera `template-*.ts` (regras em `RULES`) |
| 6 | `validate-cards.ts <pasta> <tipo> <n> [desde]` | Gera o PDF de cards reais do banco |
| 7 | `validate-match.py <pasta> <tipo> [--diff]` | Acha o contrato assinado do mesmo cliente e compara |
| — | `coverage-report.ts <saida.json>` | Roda o gerador em todos os cards e mede a cobertura |

```bash
npx tsx --conditions=react-server scripts/contracts-tools/validate-cards.ts ./scripts/contracts-tools/work/val saude_unica 6 2025-06
python scripts/contracts-tools/validate-match.py scripts/contracts-tools/work/val saude_unica
```

Armadilhas já encontradas:

- Os PDFs do Clicksign têm 3–4 páginas finais de log (assinaturas): corte antes de
  "Hash do documento original" / "Documento número #" / "ANÁLISE CRÍTICA".
- Os PDFs escaneados (`NNNNN.pdf`, 1–4 MB) não têm texto. A Colefar é quase toda
  escaneada.
- Nomes de arquivo com `Relatório`, `auditoria`, `Aditivo`, `Analise` **não são**
  contratos.
- Escreva expressões regulares em literais *raw* no Python (`\b` vira caractere de
  controle em literal comum).
