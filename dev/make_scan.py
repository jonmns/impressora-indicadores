# PUR digitalizado sintetico: paginas em imagem, tabelas giradas, carimbo em texto. Nenhum dado real.
import sys,asyncio,io,random
from PIL import Image,ImageFilter
from playwright.async_api import async_playwright
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
out=sys.argv[1]; random.seed(7)
fmt=lambda v:f'{v:,.2f}'.replace(',','X').replace('.',',').replace('X','.') if v else '-'
rub=[('I - uso de programas de computação, de máquinas, de equipamentos, de aparelhos e de instrumentos, seus acessórios, sobressalentes e ferramentas e serviço de instalação dessas máquinas e equipamentos;','prog'),
('II - aquisição, implantação, ampliação ou modernização de infraestrutura física e de laboratórios de PD&I de ICT, realizadas e justificadas no âmbito de projetos de PD&I;','lab'),
('III a - recursos humanos diretos;','rhd'),('III b - recursos humanos indiretos;','rhi'),('IV - aquisições de livros e periódicos técnicos;','livros'),('V - materiais de consumo;','mat'),('VI - viagens;','via'),('VII - treinamento;','tre'),('VIII - serviços técnicos de terceiros; e','stt'),('IX - outros correlatos.','cor')]
def table(n,title):
    data={}
    for _,k in rub:
        if k in('rhd','rhi'): data[k]=[round(random.uniform(8000,99999),2) for _ in range(n)]
        elif k in('cor',): data[k]=[round(random.uniform(3000,9000),2) for _ in range(n)]
        elif k=='livros': data[k]=[0]*n
        else: data[k]=[round(random.uniform(400,90000),2) if random.random()<.25 else 0 for _ in range(n)]
    rows=''
    for lab,k in rub:
        rows+=f'<tr><td class=l>{lab}</td>'+''.join(f'<td>{fmt(v)}</td>' for v in data[k])+f'<td class=b>{fmt(round(sum(data[k]),2))}</td></tr>'
    sub=[round(sum(data[k][i] for _,k in rub),2) for i in range(n)]
    rows+='<tr class=g><td class=c>Sub-Total</td>'+''.join(f'<td>{fmt(v)}</td>' for v in sub)+f'<td>{fmt(round(sum(sub),2))}</td></tr>'
    head=''.join(f'<th>Mês {i+1:02d}</th>' for i in range(n))
    return f'''<html><body style="margin:40px;width:1120px;font-family:Arial;background:#fff"><h3>{title}</h3><style>table{{border-collapse:collapse;font-size:7.4px;width:100%}}td,th{{border:1px solid #9a9;padding:2px 3px;text-align:right}}th{{background:#dcecd2;text-align:center}}.l{{text-align:left;width:170px}}.b{{font-weight:bold}}.g{{background:#dcecd2;font-weight:bold}}.c{{text-align:center}}</style><table><tr><th>Rubricas</th>{head}<th>TOTAL (R$)</th></tr>{rows}</table><div style="height:60px"></div></body></html>''',data
txt='<html><body style="margin:60px;width:700px;font-family:Arial;font-size:13px;background:#fff"><h2>Adendo ao Plano de Utilização de Recursos</h2>'+'<p>Este adendo altera o cronograma do projeto e descreve as atividades previstas em cada etapa, com os responsáveis e as entregas pactuadas entre a instituição executora e a coordenadora.</p>'*14+'</body></html>'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1200,'height':820},device_scale_factor=2.4)
        shots=[]; truth={}
        for kind,html in [('txt',txt),('txt',txt)]:
            await pg.set_content(html); shots.append(('p',await pg.screenshot(full_page=False)))
        for n,title,key in [(12,'CRONOGRAMA FINANCEIRO<br><br>De:','de'),(15,'Para:','para')]:
            html,data=table(n,title); truth[key]=data
            await pg.set_content(html); shots.append(('l',await pg.screenshot(full_page=False)))
        await b.close()
    import json; json.dump(truth,open(f'{out}/scan_truth.json','w'))
    c=canvas.Canvas(f'{out}/Adendo_scan.pdf',pagesize=(612,792))
    for kind,png in shots:
        im=Image.open(io.BytesIO(png)).convert('RGB')
        if kind=='l': im=im.rotate(90,expand=True)
        im=im.filter(ImageFilter.GaussianBlur(.6)); bio=io.BytesIO(); im.save(bio,'JPEG',quality=70); bio.seek(0)
        c.drawImage(ImageReader(bio),30,40,552,712,preserveAspectRatio=True)
        c.setFont('Helvetica',6)
        for i,t in enumerate(['Este documento foi assinado digitalmente por Fulano de Tal e Beltrano. Este documento foi assinado eletronicamente por Sicrano.','Para verificar as assinaturas va ao site http://assinaturas.exemplo.br e utilize o codigo AAAA-BBBB.']):
            c.drawString(30,24-i*8,t)
        c.showPage()
    c.setFont('Helvetica',10)
    for i,t in enumerate(['PROTOCOLO DE ASSINATURA(S)']+['Registro de assinatura numero %d com data, IP e identificacao do signatario do documento.'%k for k in range(30)]): c.drawString(40,740-i*14,t)
    c.showPage(); c.save()
asyncio.run(main())
