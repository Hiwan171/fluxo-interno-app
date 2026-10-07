import csv, json, re, time, os, random, sys
from concurrent.futures import ThreadPoolExecutor
import pymupdf

SCR = os.environ.get("CONTRACTS_WORK") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "work")
os.makedirs(SCR, exist_ok=True)
ROOT = r"Z:\GERAL\CONTRATOS ESCANEADOS\CONTRATOS SCANEADOS"
OUT = f"{SCR}/z_full.jsonl"
rows = list(csv.DictReader(open(f"{SCR}/z_index.csv", encoding="utf-8-sig")))
for r in rows:
    r["kb"] = float(r["Len"]) / 1024
    m = re.match(r"\s*0*(\d{3,6})\b", r["Nome"])
    r["num"] = int(m.group(1)) if m else None

SKIP = ("relat", "auditoria", "aditiv", "aditament", "distrato", "termo cx", "proposta")
def is_contract(r):
    l = r["Nome"].lower()
    return "contrato" in l and not any(k in l for k in SKIP) and "analise" not in l and "análise" not in l

RARE = re.compile(r"unica|única|avuls|industrial|classe|renova|consolid|suprimento|eventual|pontual|licita|prefeitura|dispensa", re.I)

rare = [r for r in rows if RARE.search(r["Nome"]) and r["kb"] < 4000 and not any(k in r["Nome"].lower() for k in ("relat", "auditoria"))]
digital = [r for r in rows if is_contract(r) and r["kb"] < 1500]

rng = random.Random(2026)
by = {}
for r in digital:
    # época aproximada pelo número do contrato (cresce com o tempo); em blocos de 2.500
    bucket = (r["num"] or 0) // 2500
    by.setdefault((r["Empresa"], bucket), []).append(r)
sample = []
for key, lst in by.items():
    rng.shuffle(lst)
    sample += lst[: max(6, min(40, len(lst) // 12))]

seen, sel = set(), []
for r in rare + sample:
    if r["Rel"] in seen: continue
    seen.add(r["Rel"]); sel.append(r)

print(f"rare={len(rare)} digital_pool={len(digital)} amostra={len(sample)} total={len(sel)} (~{sum(r['kb'] for r in sel)/1024:.0f} MB)", flush=True)

def fetch(r):
    try:
        with open(os.path.join(ROOT, r["Rel"]), "rb") as f:
            return r, f.read(), None
    except Exception as e:
        return r, None, str(e)[:100]

t0 = time.time(); done = 0
with open(OUT, "w", encoding="utf-8") as fh, ThreadPoolExecutor(max_workers=16) as ex:
    for r, data, err in ex.map(fetch, sel):
        rec = {"emp": r["Empresa"], "rel": r["Rel"], "nome": r["Nome"], "kb": int(r["kb"]), "data": r["Data"][:10], "num": r["num"]}
        if err:
            rec["err"] = err
        else:
            try:
                d = pymupdf.open(stream=data, filetype="pdf")
                rec["pages"] = len(d)
                txt = "".join(f"\n=====PAGE {i+1}=====\n" + p.get_text() for i, p in enumerate(d) if i < 16)
                rec["text"] = txt[:70000]
                rec["chars"] = len(txt)
            except Exception as e:
                rec["err"] = "parse: " + str(e)[:80]
        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        done += 1
        if done % 100 == 0:
            print(f"{done}/{len(sel)} em {time.time()-t0:.0f}s", flush=True)
print(f"FIM {done} em {time.time()-t0:.0f}s", flush=True)
