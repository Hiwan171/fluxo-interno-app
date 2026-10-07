import pymupdf, re, sys, difflib, unicodedata
def txt(path):
    d=pymupdf.open(path); t=""
    for p in d: t+="\n"+p.get_text()
    t=re.sub(r"\{\{[^}]*\}\}"," ",t); t=re.sub(r"Clicksign\s+[0-9a-f-]{36}"," ",t); t=re.sub(r"P[áa]gina \d+ de \d+"," ",t)
    t=" ".join(t.split())
    t=re.sub(r"(?i)Pelo presente instrumento","\x00Pelo presente instrumento",t,count=1)
    i=t.find("\x00"); t=t[i+1:] if i>=0 else t
    m=re.search(r"Hash do documento original|Documento n[úu]mero #|AN[ÁA]LISE CR[ÍI]TICA DE CONTRATO|Data da revis[ãa]o|Assinaturas\s+[A-Z]|Log\s+\d\d \w{3} \d{4}",t,re.I)
    return t[:m.start()] if m else t
a=txt(sys.argv[1]).split(); b=txt(sys.argv[2]).split()
sm=difflib.SequenceMatcher(None,a,b,autojunk=False)
print(f"ratio={sm.ratio():.3f}  A={len(a)} palavras  B={len(b)} palavras")
lim=int(sys.argv[3]) if len(sys.argv)>3 else 400
for tag,i1,i2,j1,j2 in sm.get_opcodes():
    if tag=="equal": continue
    x=" ".join(a[i1:i2]); y=" ".join(b[j1:j2])
    if len(x)<3 and len(y)<3: continue
    print(f"[{tag}] ...{' '.join(a[max(0,i1-5):i1])} ||\n    A: {x[:lim]!r}\n    B: {y[:lim]!r}")
