"""Confere o .xlsx exportado contra a planilha financeira real, celula a celula, com leitura independente (openpyxl). Nao grava nada.
Uso: python dev/check_real.py PLANILHA_FIN INDICADORES_XLSX MEMORIA_JSON"""
import sys, json, re, datetime, unicodedata
import openpyxl
from openpyxl.utils import get_column_letter as L

fin_path, out_path, mem_path = sys.argv[1:4]
mem = json.load(open(mem_path, encoding='utf8'))
start, dur, closed = mem['start'], mem['duration'], mem['closed']
fin = openpyxl.load_workbook(fin_path, data_only=True, read_only=False)
out = openpyxl.load_workbook(out_path, data_only=True)
norm = lambda s: re.sub(r'\s+', ' ', unicodedata.normalize('NFD', str(s or '').replace(' ', ' ')).encode('ascii', 'ignore').decode().lower()).strip()
mm = lambda d: d.year * 12 + d.month - 1
num = lambda v: v if isinstance(v, (int, float)) else (0.0 if isinstance(v, str) and v.strip() in ('-', '') else v)
TOL = 0.005
issues, checked = [], 0

def cmp(where, got, want):
    global checked
    checked += 1
    if want is None and got is None: return
    if not isinstance(got, (int, float)) or not isinstance(want, (int, float)) or abs(got - want) > TOL:
        issues.append(f'{where}: xlsx={got!r} esperado={want!r}')

pos = fin['Posição Financeira']
cols = {}
for c in range(13, 81):
    v = pos.cell(7, c).value
    if isinstance(v, datetime.datetime): cols[mm(v) - start] = c
realizado = {m: norm(pos.cell(6, c).value) == 'realizado' for m, c in cols.items()}
labels = {'Equipamentos': r'^i\s*-', 'Laboratório': r'^ii\s*-', 'RHD': r'^iii\s*a', 'RHI': r'^iii\s*b', 'Materiais': r'^v\s*-', 'STT': r'^viii', 'Correlatos': r'^ix'}
for cat, rx in labels.items():
    r = next(r for r in range(8, 70) if re.match(rx, norm(pos.cell(r, 2).value)))
    plan = next(k for k in range(r, r + 3) if norm(pos.cell(k, 12).value).startswith('pur'))
    real = next(k for k in range(r, r + 4) if norm(pos.cell(k, 12).value).startswith('real'))
    ws = out[cat]
    tot_real = 0
    for m in range(dur):
        c = L(m + 2)
        cmp(f'{cat}!{c}2 (PUR, mês {m+1}) x Posição {L(cols[m])}{plan}', ws[f'{c}2'].value, num(pos.cell(plan, cols[m]).value))
        if m < closed:
            if not realizado.get(m): issues.append(f'{cat} mês {m+1}: competência não marcada como realizado')
            want = num(pos.cell(real, cols[m]).value); tot_real += want or 0
            cmp(f'{cat}!{c}3 (realizado, mês {m+1}) x Posição {L(cols[m])}{real}', ws[f'{c}3'].value, want)
        else:
            cmp(f'{cat}!{c}3 (futuro vazio)', ws[f'{c}3'].value, None)
    # Total realizado da coluna E = soma dos meses (so vale quando o fechamento cobre todas as competencias realizadas).
    e = pos.cell(r, 5).value
    if isinstance(e, (int, float)) and abs(e - tot_real) > 0.01: issues.append(f'{cat}: soma realizada dos meses {tot_real:.2f} difere de Total Realizado (E{r}) {e:.2f}')
    # Formulas e caches: acumulados e percentuais.
    acc_p = acc_r = 0
    for m in range(dur):
        c = L(m + 2); acc_p += ws[f'{c}2'].value or 0
        cmp(f'{cat}!{c}4 acumulado PUR', ws[f'{c}4'].value, acc_p)
        if m < closed:
            acc_r += ws[f'{c}3'].value or 0
            cmp(f'{cat}!{c}5 acumulado real', ws[f'{c}5'].value, acc_r)
            if acc_p: cmp(f'{cat}!{c}6 %', ws[f'{c}6'].value, acc_r / acc_p)

# RH realizado: agrupa pela coluna "Mes de Referencia" (texto M-AAAA), independente da coluna Data usada pelo site.
for cat, key in (('RHD', 'rhd'), ('RHI', 'rhi')):
    s = next(s for s in fin.worksheets if key in norm(s.title) and 'abertura' in norm(s.title))
    hdr = next(r for r in range(1, 21) if any(norm(s.cell(r, c).value) == 'horas trabalhadas' for c in range(1, 60)))
    hc = {norm(s.cell(hdr, c).value): c for c in range(1, 60) if s.cell(hdr, c).value}
    ch, cc, cn = hc['horas trabalhadas'], hc['cpf'], hc['nome do funcionario']
    hours, people = [0.0] * closed, [set() for _ in range(closed)]
    for r in range(hdr + 1, s.max_row + 1):
        ref, name = s.cell(r, 1).value, s.cell(r, cn).value
        if not name or not str(name).strip(): continue
        mt = re.match(r'^(\d{1,2})-(\d{4})$', str(ref or ''))
        if not mt: issues.append(f'{s.title}!A{r}: referência {ref!r} não reconhecida'); continue
        m = int(mt[2]) * 12 + int(mt[1]) - 1 - start
        if 0 <= m < closed:
            hours[m] += s.cell(r, ch).value or 0
            people[m].add(re.sub(r'\D', '', str(s.cell(r, cc).value or '')) or norm(name))
    ws = out[cat]
    for m in range(closed):
        c = L(m + 2)
        cmp(f'{cat}!{c}16 horas realizadas mês {m+1}', ws[f'{c}16'].value, hours[m])
        cmp(f'{cat}!{c}11 profissionais realizados mês {m+1}', ws[f'{c}11'].value, len(people[m]))
    acc_p = acc_r = 0
    for m in range(dur):
        c = L(m + 2); acc_p += ws[f'{c}15'].value or 0
        cmp(f'{cat}!{c}17 horas PUR acumuladas', ws[f'{c}17'].value, acc_p)
        if m < closed:
            acc_r += ws[f'{c}16'].value or 0
            cmp(f'{cat}!{c}18 horas realizadas acumuladas', ws[f'{c}18'].value, acc_r)
            if acc_p: cmp(f'{cat}!{c}19 % horas', ws[f'{c}19'].value, acc_r / acc_p)

print(json.dumps({'project': mem.get('project'), 'checked': checked, 'issues': len(issues)}, ensure_ascii=False))
for i in issues[:60]: print(' -', i)
