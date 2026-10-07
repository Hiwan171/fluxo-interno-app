"""Gera um arquivo template-*.ts a partir do JSON de blocos.
uso: make_template_generic.py <blocks.json> <saida.ts> <nome-variante>
As regras de substituição ficam em RULES[<variante>]: (regex literal, substituição, escopo) ;
cada regra precisa acertar EXATAMENTE uma vez no bloco indicado (índice), senão aborta.
"""
import json, re, sys

blocks = json.load(open(sys.argv[1], encoding="utf-8"))
out_path, variant = sys.argv[2], sys.argv[3]

def clean(t):
    for _ in range(3):
        t = t.replace("__** **__", " ").replace("** **", " ").replace("__ __", " ")
    return re.sub(r"\s+", " ", t).strip()

RULES = {
    "saude_unica": {
        "doc": "Modelo \"Coleta dos resíduos de serviço de saúde (COLETA ÚNICA)\". Extraído do contrato 36028 (Ambientec, out/2026).",
        "title": "CONTRATO DE PRESTAÇÃO DE SERVIÇO PARA REALIZAÇÃO DA COLETA DOS RESÍDUOS DE SERVIÇO DE SAÚDE (COLETA ÚNICA)",
        "const": "SAUDE_UNICA",
        "sub": [
            (1, "nos grupos **A** (infectante), **B** (químico) e **E** (perfuro cortante)", "{{{grupos}}}"),
            (11, "**08:00 às 18:00**", "**08:00 às {{horarioFim}}**"),
            (38, "**R$ 380,00 (Trezentos e Oitenta Reais)**", "**{{mensalidade}}**"),
            (38, "**5 (Cinco)**", "**{{franquiaNumero}}**"),
            (39, "**R$7,50 (Sete Reais e Cinquenta Centavos)**", "**{{excedente}}**"),
            (43, "serviço. **Sendo necessário o pagamento de 50% do valor antecipado, para a programação da coleta.**", "serviço.{{{antecipado}}}"),
            (44, "ao dia,", "ao {{jurosPeriodo}},"),
            (62, "**Iguatama/MG.**", "**{{foro}}.**"),
        ],
        "table_at": 40,
        "table_split": "Lâmpadas inteiras",
    },
    "industrial": {
        "title": "CONTRATO DE PRESTAÇÃO DE SERVIÇO PARA REALIZAÇÃO DA COLETA DOS RESÍDUOS INDUSTRIAIS CLASSE I",
        "const": "INDUSTRIAL",
        "doc": "Modelo \"Coleta dos resíduos industriais Classe I\". Extraído do contrato 36793 (Ambientec, mai/2026).",
        "extra": "Diferenças em relação ao modelo de saúde: objeto \"resíduos industriais de Classe I\", preço por período de cobrança (trimestre, bimestre…), sem tabela de lâmpadas (vira a cláusula 4.2), cláusulas de estrada não pavimentada, nota fiscal de saída e big bags, sem cláusula de animais.",
        "sub": [
            (5, "–A coleta", "– A coleta"),
            (5, "**Trimestral (Uma vez a cada três meses)**", "**{{frequencia}}**"),
            (11, "**17:00**", "**{{horarioFim}}**"),
            (40, "**R$ 380,00 (Trezentos e Oitenta Reais)**", "**{{mensalidade}}**"),
            (40, "por (**Trimestre)** considerando", "por **({{periodo}})** considerando"),
            (40, "**25 (Vinte e Cinco) quilos**", "**{{franquia}}**"),
            (40, "resíduo por (**Trimestre) A cobrança será realizada (Trimestralmente) sendo", "resíduo por **({{periodo}}) A cobrança será realizada ({{periodoAdv}}) sendo"),
            (42, "**R$ 8,50 (Oito Reais e Cinquenta Centavos)**", "**{{excedente}}**"),
            (45, "no site da **CONTRATANTE**.", "no site da **{{siteDoBoleto}}**."),
            (46, "ao mês,", "ao {{jurosPeriodo}},"),
            (75, "**Iguatama/MG.**", "**{{foro}}.**"),
        ],
    },
    "industrial_unica": {
        "title": "CONTRATO DE PRESTAÇÃO DE SERVIÇO PARA REALIZAÇÃO DA COLETA DOS RESÍDUOS INDUSTRIAIS CLASSE I (COLETA ÚNICA)",
        "const": "INDUSTRIAL_UNICA",
        "doc": "Modelo \"Coleta dos resíduos industriais Classe I (COLETA ÚNICA)\". Extraído do contrato 37332 (Ambientec, ago/2026).",
        "sub": [
            (10, "**08:00 às 17:00**", "**08:00 às {{horarioFim}}**"),
            (39, "**R$ 800,00 (Oitocentos Reais)**", "**{{mensalidade}}**"),
            (39, "**40 (Quarenta)**", "**{{franquiaNumero}}**"),
            (41, "**R$ 20,00 (Vinte Reais)**", "**{{excedente}}**"),
            (44, "serviço. **Sendo necessário o pagamento de 50% do valor antecipado, para a programação da coleta.**", "serviço.{{{antecipado}}}"),
            (45, "ao dia,", "ao {{jurosPeriodo}},"),
            (63, "**Iguatama/MG.**", "**{{foro}}.**"),
        ],
    },
}[variant]

subs = {}
for idx, old, new in RULES["sub"]:
    subs.setdefault(idx, []).append((old, new))

items = []
for idx, (k, n, t) in enumerate(blocks):
    t = clean(t)
    if not t:
        continue
    if k == "h":
        items.append({"kind": "heading", "text": t.strip("*").strip().replace("SEXTA–", "SEXTA –")})
        continue
    for old, new in subs.get(idx, []):
        assert t.count(old) == 1, (idx, old, t.count(old), t[:90])
        t = t.replace(old, new)
    if idx == RULES.get("table_at"):
        head, tail = t.split(RULES["table_split"], 1)
        items.append({"kind": "item", "num": n, "text": head.strip()})
        items.append({"kind": "table_marker"})
        continue
    d = {"kind": "item", "text": t}
    if n:
        d["num"] = n
    if n is None and re.match(r"^(i|ii)\)", t, re.I):
        d["indent"] = True
    items.append(d)

lines = []
for b in items:
    if b["kind"] == "table_marker":
        lines.append("  { kind: \"table\", rows: BASE_LAMP_TABLE }")
        continue
    parts = [f'kind: {json.dumps(b["kind"])}']
    if b.get("num"):
        parts.append(f'num: {json.dumps(b["num"])}')
    parts.append(f'text: {json.dumps(b["text"], ensure_ascii=False)}')
    if b.get("indent"):
        parts.append("indent: true")
    lines.append("  { " + ", ".join(parts) + " }")

const = RULES["const"]
uses_table = any(b["kind"] == "table_marker" for b in items)
imports = ('import { CONTRACT_BLOCKS, type TemplateBlock } from "@/lib/contracts/template";' if uses_table
           else 'import type { TemplateBlock } from "@/lib/contracts/template";')
table_decl = '''
// A tabela de lâmpadas, pilhas e aerossol é idêntica à do modelo recorrente.
const BASE_LAMP_TABLE = (
  CONTRACT_BLOCKS.find((block) => block.kind === "table") as Extract<
    TemplateBlock,
    { kind: "table" }
  >
).rows;
''' if uses_table else ""
src = f'''{imports}

/**
 * {RULES["doc"]}
 * Mesmas regras dos demais modelos: **não corrigir redação aqui sem aval do
 * jurídico** ("SETIMA", "quais quer", numeração repetida). Marcadores: ver
 * `template.ts`.
 *
 * {RULES.get("extra", "Coleta única: uma coleta agendada com 48 h de antecedência, vigência de 3 meses (nova coleta, novo contrato), preço por coleta, pagamento em 7 dias com 50% antecipado (opcional), 10 cláusulas.")}
 */
{table_decl}
export const {const}_TITLE =
  {json.dumps(RULES["title"], ensure_ascii=False)};

export const {const}_BLOCKS: ReadonlyArray<TemplateBlock> = [
''' + ",\n".join(lines) + ",\n];\n"
open(out_path, "w", encoding="utf-8", newline="\n").write(src)
print(len(items), "blocos ->", out_path)
