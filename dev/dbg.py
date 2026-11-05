# Despeja o texto do OCR por página. Equivalente em Python de dbg.js. Uso: python dev/dbg.py http://127.0.0.1:8931 arquivo.pdf
import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.on('pageerror', lambda e: print('ERR', e)); pg.on('console', lambda m: print('console', m.type, m.text[:300]))
    pg.goto(sys.argv[1] + '/index.html'); pg.set_input_files('#pur', sys.argv[2])
    r = pg.evaluate("""async()=>{const o=await import('./pur-ocr.js'),d=await import('./pur-pdf.js');const f=document.getElementById('pur').files[0],buf=await f.arrayBuffer();
      const pages=await d.pdfPages(buf);const blank=o.textlessPages(pages);const t=performance.now();const x=await o.ocrPages(f,buf,blank);
      return {rot:x.rotations,blank,tables:x.tables,ms:performance.now()-t,lines:Object.fromEntries(Object.entries(x.lines).map(([k,v])=>[k,v.map(l=>l.cells.map(c=>c.text).join(' | '))]))};}""", )
    print(r['rot'], r['blank'], r['tables'], round(r['ms']), 'ms')
    for k, v in r['lines'].items():
        print('--- pagina', int(k) + 1, len(v)); print('\n'.join(s[:170] for s in v))
    b.close()
