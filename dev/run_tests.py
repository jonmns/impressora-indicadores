# Roda tests.html no Chromium. Equivalente em Python de run-tests.js. Uso: python dev/run_tests.py http://127.0.0.1:8931
import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.goto(sys.argv[1] + '/tests.html')
    pg.wait_for_function('document.body.dataset.result', timeout=120000)
    print(pg.evaluate("document.getElementById('result').textContent"))
    ok = pg.evaluate('document.body.dataset.result') == 'passed'
    b.close()
sys.exit(0 if ok else 1)
