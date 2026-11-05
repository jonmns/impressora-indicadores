# Percorre o fluxo real da página (upload + "Extrair e conferir") para cada PUR sintético com texto. Equivalente em Python de run.js.
# Uso: python dev/run.py http://127.0.0.1:8931 PASTA_FIXTURES
import sys, os, json
from playwright.sync_api import sync_playwright
base, fx = sys.argv[1:3]
with sync_playwright() as p:
    b = p.chromium.launch()
    for name in ['pur_cabecalho_normal', 'pur_cabecalho_mesano', 'pur_cabecalho_m1', 'pur_cabecalho_vertical']:
        pg = b.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(base + '/index.html')
        pg.set_input_files('#finance', os.path.join(fx, 'financeiro.xlsx')); pg.set_input_files('#pur', os.path.join(fx, name + '.pdf'))
        pg.fill('#closed', '2026-09'); pg.check('#approved'); pg.click('#analyze')
        pg.wait_for_function("!document.getElementById('analyze').disabled&&!/Lendo|Cruzando/.test(document.getElementById('status').textContent)", timeout=30000)
        out = pg.evaluate("""()=>({status:document.getElementById('status').textContent,isErr:document.getElementById('status').classList.contains('error'),review:!document.getElementById('review').hidden,
          notices:[...document.querySelectorAll('#notices .notice')].map(n=>n.textContent).slice(0,6),cols:document.querySelectorAll('#grid thead th').length-1,first:document.querySelector('#grid tbody input')?.value})""")
        out['errs'] = errs; print(name, json.dumps(out, ensure_ascii=False)); pg.close()
    b.close()
