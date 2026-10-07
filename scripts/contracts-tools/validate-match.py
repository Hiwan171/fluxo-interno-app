"""Para cada contrato gerado de um card real, procura na pasta Z: o contrato assinado do
mesmo cliente (pelo nome no arquivo) e compara palavra a palavra.
uso: val_match.py <pasta-val> <kind>
"""
import csv, json, os, re, sys, shutil, difflib, unicodedata, pymupdf
SCR = os.environ.get("CONTRACTS_WORK") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "work")
os.makedirs(SCR, exist_ok=True)
ROOT = r"Z:\GERAL\CONTRATOS ESCANEADOS\CONTRATOS SCANEADOS"
val_dir, kind = sys.argv[1], sys.argv[2]
meta = json.load(open(f"{val_dir}/val_{kind}_meta.json", encoding="utf-8"))
rows = list(csv.DictReader(open(f"{SCR}/z_index.csv", encoding="utf-8-sig")))

def fold(s): return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()
STOP = {"ltda", "me", "epp", "eireli", "de", "da", "do", "das", "dos", "e", "sa", "s", "a", "i", "ii", "cia", "comercio", "industria", "servicos", "clinica", "drogaria"}
def toks(s): return [t for t in re.findall(r"[a-z0-9]+", fold(s)) if t not in STOP and len(t) > 2]
SKIP = ("relat", "auditoria", "aditiv", "aditament", "analise", "distrato", "proposta")

CUT = re.compile(r"Hash do documento original|Documento n[úu]mero #|AN[ÁA]LISE CR[ÍI]TICA DE CONTRATO|Regi[ãa]o: Atendemos", re.I)
def body(path_or_bytes):
    d = pymupdf.open(path_or_bytes) if isinstance(path_or_bytes, str) else pymupdf.open(stream=path_or_bytes, filetype="pdf")
    out = []
    for p in d:
        t = p.get_text()
        m = CUT.search(t)
        out.append(t[:m.start()] if m else t)
        if m: break
    t = " ".join(" ".join(out).split())
    t = re.sub(r"\{\{[^}]*\}\}", " ", t); t = re.sub(r"Clicksign\s+[0-9a-f-]{36}", " ", t); t = re.sub(r"P[áa]gina \d+ de \d+", " ", t)
    i = t.find("Pelo presente"); t = t[i:] if i >= 0 else t
    t = re.sub(r"_{3,}", " ", t)
    return fold(t).replace("“", '"').replace("”", '"').replace("’", "'").replace("–", "-").split()

summary = []
for m in meta:
    want = toks(m["razao"])[:3]
    if not want: continue
    cands = []
    for r in rows:
        n = fold(r["Nome"])
        if any(k in n for k in SKIP) or "contrato" not in n and "avulso" not in n: continue
        if r["Empresa"] != m["company"]: continue
        if all(w in n for w in want) and float(r["Len"]) < 1_800_000:
            cands.append(r)
    if not cands:
        summary.append((m["card"], m["company"], m["razao"][:38], None, "sem contrato assinado encontrado")); continue
    r = sorted(cands, key=lambda r: r["Nome"])[-1]
    try:
        signed = body(open(os.path.join(ROOT, r["Rel"]), "rb").read())
    except Exception as e:
        summary.append((m["card"], m["company"], m["razao"][:38], None, f"erro ao ler: {e}")); continue
    mine = body(f"{val_dir}/{m['file']}")
    if len(signed) < 200:
        summary.append((m["card"], m["company"], m["razao"][:38], None, "assinado é escaneado/sem texto")); continue
    sm = difflib.SequenceMatcher(None, signed, mine, autojunk=False)
    summary.append((m["card"], m["company"], m["razao"][:38], round(sm.ratio(), 3), r["Nome"][:60]))
    if "--diff" in sys.argv:
        print(f"\n### card #{m['card']} {m['razao']} | assinado: {r['Nome']}")
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal": continue
            a = " ".join(signed[i1:i2]); b = " ".join(mine[j1:j2])
            if len(a) + len(b) < 6: continue
            print(f"  [{tag}] ...{' '.join(signed[max(0,i1-4):i1])} || ASSINADO: {a[:110]!r} || GERADO: {b[:110]!r}")

print(f"\n{'card':>6} {'empresa':10} {'cliente':38} {'similar.':>8}  arquivo assinado")
for s in summary:
    print(f"{s[0]:>6} {s[1]:10} {s[2]:38} {str(s[3]) if s[3] is not None else '-':>8}  {s[4]}")
ok = [s[3] for s in summary if s[3] is not None]
if ok: print(f"\n{len(ok)} comparados | média {sum(ok)/len(ok):.3f} | mín {min(ok):.3f} | máx {max(ok):.3f}")
