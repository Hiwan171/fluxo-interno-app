"""Extrai os blocos (cláusulas) de um contrato em PDF com negrito/itálico.
uso: extract_generic.py <pdf> <saida.json>
Começa em 'CLÁUSULA PRIMEIRA' e termina na linha que contém 'art. 884' (fim do Parágrafo Único).
"""
import pymupdf, re, sys, json

pdf, out = sys.argv[1], sys.argv[2]
d = pymupdf.open(pdf)
STOP = re.compile(r"Hash do documento original|Documento n[úu]mero #|AN[ÁA]LISE CR[ÍI]TICA DE CONTRATO|Regi[ãa]o: Atendemos", re.I)
NUM = re.compile(r"^(\d+(?:\.\d+)*\.?)(?:\s+|(?=[–-])|$)")

lines = []
for pn, p in enumerate(d):
    if STOP.search(p.get_text()):
        break
    for b in p.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            y0, x0 = l["bbox"][1], l["bbox"][0]
            if y0 > 795: continue              # rodapé / Clicksign
            if y0 < 72 and x0 > 400: continue  # logo
            runs = []
            for s in l["spans"]:
                f = s["font"]
                if f.startswith("OpenSans") or not s["text"]: continue
                runs.append([s["text"], "Bold" in f or bool(s["flags"] & 16), "Italic" in f or bool(s["flags"] & 2)])
            txt = "".join(r[0] for r in runs)
            if re.fullmatch(r"\s*P[áa]gina \d+ de \d+\s*", txt) or "{{" in txt: continue
            if runs: lines.append({"x": x0, "runs": runs})

def text(l): return "".join(r[0] for r in l["runs"])
start = next(i for i, l in enumerate(lines) if text(l).strip().startswith("CLÁUSULA PRIMEIRA"))
end = next(i for i, l in enumerate(lines) if "884" in text(l) and i > start)
lines = lines[start:end + 1]

blocks, cur = [], None
def flush():
    global cur
    if cur: blocks.append(cur); cur = None
for l in lines:
    t = text(l).strip()
    if not t: continue
    if t.startswith("CLÁUSULA"):
        flush(); blocks.append({"k": "h", "num": None, "runs": [r[:] for r in l["runs"]]}); continue
    m = NUM.match(t)
    isnum = bool(m) and not re.match(r"^\d+\s*(\(|minutos|horas|dias|%)", t)
    is_sub = bool(re.match(r"^(i{1,3}|iv|v)\)", t, re.I))
    newp = isnum or is_sub or t.startswith("“") or t.startswith("Parágrafo") or t.startswith("Lei PNRS")
    if newp:
        flush()
        cur = {"k": "i", "num": None, "runs": []}
        runs = [r[:] for r in l["runs"]]
        if isnum:
            num = m.group(1); cur["num"] = num
            runs[0][0] = runs[0][0].lstrip()[len(num):].lstrip()
            if not runs[0][0]: runs = runs[1:]
        cur["runs"] = runs
    else:
        if cur is None: cur = {"k": "i", "num": None, "runs": []}
        cur["runs"].append([" ", False, False]); cur["runs"] += [r[:] for r in l["runs"]]
flush()

def ser(runs):
    m = []
    for t, b, i in runs:
        if m and m[-1][1] == b and m[-1][2] == i: m[-1][0] += t
        else: m.append([t, b, i])
    o = ""
    for t, b, i in m:
        t = re.sub(r"\s+", " ", t)
        if not t.strip(): o += t; continue
        lead = t[:len(t) - len(t.lstrip())]; trail = t[len(t.rstrip()):]; core = t.strip()
        if i: core = f"__{core}__"
        if b: core = f"**{core}**"
        o += lead + core + trail
    o = re.sub(r"\s+", " ", o).strip()
    for _ in range(3):
        o = o.replace("__** **__", " ").replace("** **", " ").replace("__ __", " ")
    return re.sub(r"\s+", " ", o).strip()

res = [[b["k"], b["num"], ser(b["runs"])] for b in blocks]
res = [r for r in res if r[2]]
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False)
with open(out.replace(".json", ".txt"), "w", encoding="utf-8") as f:
    for i, (k, n, t) in enumerate(res): f.write(f"[{i}] {k} {n!r}: {t}\n")
print(len(res), "blocos")
