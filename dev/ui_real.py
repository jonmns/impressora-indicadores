"""Fluxo pela tela de um projeto usando o formulario de media de RH (Distribuir nos meses), gera e baixa o .xlsx. OUT deve ficar fora do repositorio.
Uso: python dev/ui_real.py BASE PASTA_DO_PROJETO OUT HORAS_RHD PROF_RHD HORAS_RHI PROF_RHI"""
import sys, glob, os, json
from playwright.sync_api import sync_playwright
base, proj, out, dh, dn, ih, inn = sys.argv[1:8]
pdf = glob.glob(os.path.join(proj, '*.pdf'))[0]; fin = glob.glob(os.path.join(proj, '*.xls*'))[0]
name = os.path.basename(proj)
with sync_playwright() as pw:
    b = pw.chromium.launch(); p = b.new_page(accept_downloads=True); errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(base + '/index.html')
    p.set_input_files('#finance', fin); p.wait_for_timeout(1000)
    p.set_input_files('#pur', pdf); p.fill('#closed', '2026-09'); p.check('#approved')
    p.click('#analyze'); p.wait_for_function("()=>!document.getElementById('analyze').disabled", timeout=40*60*1000)
    print('antes:', p.text_content('#counts'))
    for cat, h, n in (('RHD', dh, dn), ('RHI', ih, inn)):
        p.click(f'#tabs button:text-is("{cat}")')
        p.fill('.spread input[data-row="15"]', h); p.fill('.spread input[data-row="10"]', n)
        p.click('.spread button')
        print(cat, '->', p.text_content('#status'), '|', p.text_content('#counts'))
        print('  linha horas:', p.eval_on_selector_all('#grid tbody tr', 'rs=>rs.map(r=>r.cells[0].textContent+": "+[...r.querySelectorAll("input")].slice(0,3).map(i=>i.value).join(" | ")+" … "+([...r.querySelectorAll("input")].pop()?.value||r.cells[r.cells.length-1].textContent))'))
        print('  fonte M1 horas:', p.eval_on_selector('#grid tbody tr:nth-child(8) input', 'i=>i?i.title:null'))
    p.check('#reviewed')
    print('exportar habilitado:', p.eval_on_selector('#export', 'e=>!e.disabled'))
    with p.expect_download() as d: p.click('#export')
    x = os.path.join(out, name + '_Indicadores.xlsx'); d.value.save_as(x)
    with p.expect_download() as d: p.click('#audit')
    d.value.save_as(os.path.join(out, name + '_memoria.json'))
    print('status:', p.text_content('#status')); print('erros:', errs); print('arquivo:', x)
    b.close()
