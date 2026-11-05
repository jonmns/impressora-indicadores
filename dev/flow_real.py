"""Fluxo completo pela tela (Playwright Python) com documentos reais, um projeto por pasta "PUR *". Grava resultados, memoria e .xlsx em OUT, que deve ficar fora do repositorio.
Uso: python dev/flow_real.py BASE_URL PASTA_PROJETOS OUT [filtro]"""
import sys, json, glob, os, time, traceback
from playwright.sync_api import sync_playwright

base, root, out = sys.argv[1:4]
filt = sys.argv[4] if len(sys.argv) > 4 else ''
os.makedirs(out, exist_ok=True)
projects = sorted(d for d in glob.glob(os.path.join(root, 'PUR *')) if filt in d)

def run(p, proj):
    name = os.path.basename(proj)
    pdfs = glob.glob(os.path.join(proj, '*.pdf'))
    fins = glob.glob(os.path.join(proj, '*.xls*'))
    res = {'project': name, 'pdf': [os.path.basename(x) for x in pdfs], 'fin': [os.path.basename(x) for x in fins]}
    if len(pdfs) != 1 or len(fins) != 1:
        res['error'] = 'arquivos ambiguos'
        return res
    page = p.new_page(accept_downloads=True)
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errs.append('console: ' + m.text))
    page.goto(base + '/index.html')
    page.set_input_files('#finance', fins[0])
    page.wait_for_timeout(1500)
    res['detected'] = page.text_content('#detected')
    res['closed_prefill'] = page.input_value('#closed')
    page.set_input_files('#pur', pdfs[0])
    page.fill('#closed', '2026-09')
    page.check('#approved')
    t0 = time.time()
    page.click('#analyze')
    page.wait_for_function("()=>!document.getElementById('analyze').disabled", timeout=40 * 60 * 1000)
    res['seconds'] = round(time.time() - t0)
    res['status'] = page.text_content('#status')
    res['status_error'] = page.eval_on_selector('#status', 'e=>e.classList.contains("error")')
    res['review'] = page.eval_on_selector('#review', 'e=>!e.hidden')
    if res['review']:
        res['notices'] = page.eval_on_selector_all('#notices .notice', 'n=>n.map(x=>x.textContent)')
        res['counts'] = page.text_content('#counts')
        with page.expect_download() as d:
            page.click('#audit')
        mem = os.path.join(out, name + '_memoria.json')
        d.value.save_as(mem)
        data = json.load(open(mem, encoding='utf8'))
        pend = {}
        for cat, rows in data['values'].items():
            for row, vals in rows.items():
                n = sum(1 for m, v in enumerate(vals) if v is None and not (int(row) in (3, 11, 16) and m >= data['closed']))
                if n:
                    pend[f'{cat}/{row}'] = n
        res['pending'] = pend
        res['duration'] = data['duration']
        res['closed'] = data['closed']
        page.check('#reviewed')
        res['export_enabled'] = page.eval_on_selector('#export', 'e=>!e.disabled')
        if res['export_enabled']:
            with page.expect_download() as d:
                page.click('#export')
            x = os.path.join(out, name + '_Indicadores.xlsx')
            d.value.save_as(x)
            res['xlsx'] = x
            res['status_after_export'] = page.text_content('#status')
    res['errors'] = errs
    page.close()
    return res

with sync_playwright() as pw:
    b = pw.chromium.launch()
    for proj in projects:
        try:
            r = run(b, proj)
        except Exception as e:
            r = {'project': os.path.basename(proj), 'exception': traceback.format_exc()[-800:]}
        print(json.dumps(r, ensure_ascii=False), flush=True)
        with open(os.path.join(out, 'results.jsonl'), 'a', encoding='utf8') as f:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    b.close()
