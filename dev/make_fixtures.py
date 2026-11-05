# Gera PDFs e planilha sinteticos para reproduzir o erro. Nenhum dado real.
import sys, openpyxl, datetime
out = sys.argv[1]
def enc(s): return s.replace('\\','\\\\').replace('(','\\(').replace(')','\\)')
def make_pdf(pages):
    objs={}
    kids=' '.join(f'{4+i*2} 0 R' for i in range(len(pages)))
    objs[1]='<< /Type /Catalog /Pages 2 0 R >>'
    objs[2]=f'<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>'
    objs[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    for i,items in enumerate(pages):
        lines=[]
        for t in items:
            m=t.get('matrix') or (1,0,0,1,t['x'],t['y'])
            lines.append(f"BT /F1 {t.get('size',7)} Tf {' '.join(str(v) for v in m)} Tm ({enc(t['text'])}) Tj ET")
        stream='\n'.join(lines)
        objs[4+i*2]=f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents {5+i*2} 0 R >>'
        objs[5+i*2]=f'<< /Length {len(stream.encode("latin-1"))} >>\nstream\n{stream}\nendstream'
    b='%PDF-1.4\n'.encode('latin-1'); offs={}
    n=max(objs)
    for i in range(1,n+1):
        offs[i]=len(b); b+=f'{i} 0 obj\n{objs[i]}\nendobj\n'.encode('latin-1')
    x=len(b)
    b+=f'xref\n0 {n+1}\n0000000000 65535 f \n'.encode()
    for i in range(1,n+1): b+=f'{offs[i]:010d} 00000 n \n'.encode()
    b+=f'trailer\n<< /Size {n+1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF'.encode()
    return b
labels=['I - Programas de computador','III a - Recursos Humanos Diretos','III b - Recursos Humanos Indiretos','IX - Outros correlatos']
def table(heads, y0=540):
    items=[{'x':30,'y':560,'text':'Cronograma de desembolso (R$)','size':10},{'x':30,'y':y0,'text':'Rubrica'}]
    for i,h in enumerate(heads): items.append({'x':200+i*50,'y':y0,'text':h})
    for r,l in enumerate(labels):
        y=y0-15*(r+1); items.append({'x':30,'y':y,'text':l})
        for i in range(len(heads)): items.append({'x':200+i*50,'y':y,'text':'1.000,00'})
    return items
# A: cabecalho em mes/ano: durationFromHeaders nao reconhece, cai na segunda leitura
meses=['set/26','out/26','nov/26','dez/26','jan/27','fev/27','mar/27','abr/27','mai/27','jun/27','jul/27','ago/27']
open(f'{out}/pur_cabecalho_mesano.pdf','wb').write(make_pdf([table(meses)+[{'x':30,'y':100,'text':'Prazo de execucao: 12 meses'}]]))
# B: cabecalho "M1": idem
open(f'{out}/pur_cabecalho_m1.pdf','wb').write(make_pdf([table([f'M{i+1}' for i in range(12)])]))
# C: cabecalho vertical (texto girado 90 graus), caso que a segunda leitura foi feita para tratar
c=[{'x':30,'y':560,'text':'Cronograma de desembolso (R$)','size':10}]
for i in range(12):
    c.append({'text':f'Mes {i+1}','matrix':(0,1,-1,0,205+i*50,500)})
for r,l in enumerate(labels):
    y=480-15*r; c.append({'x':30,'y':y,'text':l})
    for i in range(12): c.append({'x':200+i*50,'y':y,'text':'1.000,00'})
open(f'{out}/pur_cabecalho_vertical.pdf','wb').write(make_pdf([c]))
# D: controle: cabecalho "Mes N" normal, nao passa pela segunda leitura
open(f'{out}/pur_cabecalho_normal.pdf','wb').write(make_pdf([table([f'Mês {i+1}'.replace('ê','\xea') for i in range(12)])]))
# Planilha financeira minima
wb=openpyxl.Workbook(); ws=wb.active; ws.title='Posição Financeira'
ws['C6']='Projeto sintetico'; ws['L1']=datetime.date(2026,9,1)
ws['M7']=datetime.date(2026,9,1); ws['N7']=datetime.date(2026,10,1); ws['M6']='Realizado'; ws['N6']='planejado'
for i,l in enumerate(['I - programas de computador','II - laboratório','III a - recursos humanos diretos','III b - recursos humanos indiretos','V - materiais de consumo','VIII - serviços técnicos de terceiros','IX - outros correlatos']):
    r=9+i*4; ws[f'B{r}']=l; ws[f'L{r+2}']='Real.'; ws[f'M{r+2}']=10+i
for name in ['III.I RHD_Abertura_Pgtos','IV.I - RHI_Abertura_Pgtos']:
    s=wb.create_sheet(name)
    for c_,v in zip('BCDJK',['Data','Nome do Funcionário','CPF','Horas Trabalhadas','Salário']): s[f'{c_}6']=v
    s['B7']=datetime.date(2026,9,1); s['C7']='Ana'; s['D7']='123'; s['J7']=10; s['K7']=9000
wb.save(f'{out}/financeiro.xlsx')
