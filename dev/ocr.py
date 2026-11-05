# Fluxo completo com um PUR digitalizado sintético, comparando com os valores verdadeiros. Equivalente em Python de ocr.js.
# Uso: python dev/ocr.py http://127.0.0.1:8931 PASTA_FIXTURES [arquivo.pdf] [chave_da_verdade]
# A verdade fica em <arquivo>.json (chave "pur") ou, para Adendo_scan.pdf, em scan_truth.json (chave "para").
import sys, json, os, time
from playwright.sync_api import sync_playwright
base, fx = sys.argv[1:3]
pdf = sys.argv[3] if len(sys.argv) > 3 else 'Adendo_scan.pdf'
key = sys.argv[4] if len(sys.argv) > 4 else ('para' if pdf == 'Adendo_scan.pdf' else 'pur')
tf = os.path.join(fx, 'scan_truth.json' if pdf == 'Adendo_scan.pdf' else pdf[:-4] + '.json')
truth = json.load(open(tf))[key]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); logs = []
    pg.on('pageerror', lambda e: logs.append('ERR ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and logs.append(m.text))
    pg.goto(base + '/index.html')
    pg.set_input_files('#finance', os.path.join(fx, 'financeiro.xlsx')); pg.set_input_files('#pur', os.path.join(fx, pdf))
    pg.fill('#closed', '2026-09'); pg.check('#approved')
    t0 = time.time(); pg.click('#analyze')
    pg.wait_for_function("!document.getElementById('analyze').disabled", timeout=600000)
    r = pg.evaluate("""async()=>{const m=await import('./pur-v2.js');const f=document.getElementById('pur').files[0];let x;
      try{x=await m.readPurPdf(f,{start:2026*12+8});}catch(e){return {error:e.message,status:document.getElementById('status').textContent};}
      return {status:document.getElementById('status').textContent,err:document.getElementById('status').classList.contains('error'),
      notices:[...document.querySelectorAll('#notices .notice')].map(n=>n.textContent),dur:x.duration,
      values:Object.fromEntries(Object.entries(x.values).map(([k,v])=>[k,v[2]])),totals:x.totals,src:x.sources.RHD[2][0]};}""")
    print('tempo', round(time.time() - t0), 's')
    if 'error' in r:
        print('ERRO', r['error']); print(r['status']); b.close(); sys.exit(1)
    print(r['status'], r['err']); print('\n'.join(r['notices'])); print('duracao', r['dur'], 'fonte', r['src'])
    cmap = {'Equipamentos': 'prog', 'Laboratório': 'lab', 'RHD': 'rhd', 'RHI': 'rhi', 'Materiais': 'mat', 'STT': 'stt', 'Correlatos': 'cor'}
    ok = bad = miss = 0
    for c, k in cmap.items():
        v, t = r['values'][c], truth[k]
        for i, x in enumerate(t):
            y = v[i] if i < len(v) else None
            if y is None: miss += 1; print('faltou', c, i + 1, x)
            elif abs(y - x) < .005: ok += 1
            else: bad += 1; print('errado', c, i + 1, 'real', x, 'lido', y)
    print({'ok': ok, 'bad': bad, 'miss': miss}); print('\n'.join(logs[:5])); b.close()
    sys.exit(1 if bad else 0)
