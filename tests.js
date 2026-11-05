import {categories,NS,openWorkbook,extract,exportWorkbook,missing,calculated,number,month,financialInfo,durationFromText} from './engine.js';
import {pdfPages,parsePur,pdfNumber} from './pur-pdf.js';
import {readPurPdf,reviewOcr,checkSubtotals} from './pur-v2.js';
import {textlessPages,repairNumber,repairHeader,wordsToLines,reconcile,valueColumns,addTitles,fillGaps} from './pur-ocr.js';
/* PDF mínimo com texto posicionado (Helvetica), para testar a leitura real pelo pdf.js sem documentos privados. */
function makePdf(pages){
 const objs=[],enc=s=>s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
 const kids=pages.map((_,i)=>`${4+i*2} 0 R`).join(' ');
 objs[1]='<< /Type /Catalog /Pages 2 0 R >>';objs[2]=`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;objs[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
 pages.forEach((items,i)=>{const stream=items.map(t=>`BT /F1 ${t.size||7} Tf ${t.x} ${t.y} Td (${enc(t.text)}) Tj ET`).join('\n');
  objs[4+i*2]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`;
  objs[5+i*2]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;});
 let out='%PDF-1.4\n';const offs=[];
 for(let i=1;i<objs.length;i++){offs[i]=out.length;out+=`${i} 0 obj\n${objs[i]}\nendobj\n`;}
 const x=out.length;out+=`xref\n0 ${objs.length}\n0000000000 65535 f \n`+offs.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
 return Uint8Array.from(out,c=>c.charCodeAt(0)&255);
}
function syntheticPur(){
 const row=(y,label,vals)=>[{x:30,y,text:label},...vals.map((v,i)=>({x:200+i*50,y,text:v}))];
 const head=y=>row(y,'Rubrica',Array.from({length:12},(_,i)=>'Mês '+(i+1)));
 const p1=[{x:30,y:560,text:'Cronograma de desembolso (R$)',size:10},...head(540),
  ...row(525,'I - Programas de computador',Array(12).fill('1.000,00')),
  ...row(510,'III a - Recursos Humanos',Array(12).fill('12.345,67')),{x:30,y:502,text:'Diretos'},
  ...row(487,'III b - Recursos Humanos Indiretos',Array(12).fill('500,50')),
  ...row(472,'IX - Outros correlatos',Array(12).fill('-')),
  ...row(457,'Total',Array(12).fill('13.846,17'))];
 const p2=[{x:30,y:560,text:'Quadro de horas mensais - Recursos Humanos Diretos',size:10},...head(540),
  ...row(525,'Pesquisador',Array(12).fill('160')),
  ...row(510,'Desenvolvedor',[...Array(6).fill('80'),...Array(6).fill('0')]),
  {x:30,y:495,text:'Recursos Humanos Indiretos'},
  ...row(480,'Gerente de projeto',Array(12).fill('40')),
  ...row(465,'Total',Array(12).fill('280'))];
 return makePdf([p1,p2]);
}
const out=document.getElementById('result');let passed=0;
const assert=(c,m)=>{if(!c)throw Error(m);passed++;};
const sheet=(name,cells)=>({name,cells:Object.fromEntries(Object.entries(cells).map(([a,v])=>[a,typeof v==='object'?v:{value:v,formula:null}])),get(a){return this.cells[a]?.value??null;}});
try{
 assert(number('1.234,56')===1234.56,'número brasileiro');assert(number('0')===0,'zero');assert(number('')===null,'ausente');assert(month('2026-09')===2026*12+8,'mês');
 const planCells={A2:'Rubricas'},posCells={C6:'Projeto sintético',L1:46266,M7:46266,N7:46296,M6:'Realizado',N6:'planejado'};
 const labels=['I - programas de computador','II - laboratório','III a - recursos humanos diretos','III b - recursos humanos indiretos','V - materiais de consumo','VIII - serviços técnicos de terceiros','IX - outros correlatos'];
 for(let m=0;m<12;m++)planCells[String.fromCharCode(66+m)+'2']='Mês '+(m+1);
 labels.forEach((label,i)=>{planCells['A'+(i+3)]=label;for(let m=0;m<12;m++)planCells[String.fromCharCode(66+m)+(i+3)]=100+i;const r=9+i*4;posCells['B'+r]=label;posCells['L'+(r+2)]='Real.';posCells['M'+(r+2)]=10+i;posCells['N'+(r+2)]=999;});
 const pay={B6:'Data',C6:'Nome do Funcionário',D6:'CPF',J6:'Horas Trabalhadas',K6:'Salário',B7:46266,C7:'Ana',D7:'123',J7:10,K7:9000,B8:46266,C8:'Ana',D8:'123',J8:5,K8:9000,B9:46296,C9:'Outra',D9:'456',J9:100};
 const fin={sheets:{pos:sheet('Posição Financeira',posCells),direct:sheet('III.I RHD_Abertura_Pgtos',pay),indirect:sheet('IV.I - RHI_Abertura_Pgtos',pay)}};
 const plan={sheets:{schedule:sheet('7.2 Cronograma Fisico_Finc.',planCells)}};
 const start=month(46266),data=extract(fin,plan,{project:'Sintético',start,duration:12,closed:1});
 assert(data.values.RHD[16][0]===15,'horas vêm de J, não salário K');assert(data.values.RHD[11][0]===1,'CPF duplicado não duplica pessoas');assert(data.values.RHD[3][1]===null,'outubro projetado fica vazio');assert(data.values.Equipamentos[3][0]===10,'rubricas mapeadas');
 assert(missing(data)>0,'RH planejado ausente precisa completar');
 let blocked=false;try{await exportWorkbook(data);}catch{blocked=true;}assert(blocked,'ausência bloqueia exportação');
 for(const cat of categories)for(const [r,v]of Object.entries(data.values[cat]))for(let m=0;m<v.length;m++)if(v[m]===null&&(![3,11,16].includes(+r)||m<data.closed))v[m]=0;
 assert(missing(data)===0,'zero explícito é válido');assert(calculated(data,'Equipamentos',6,0)===.1,'percentual acumulado');
 const blob=await exportWorkbook(data),book=await openWorkbook(await blob.arrayBuffer());assert(book.sheets.RHD.get('B16')===15,'exportação preserva horas');assert(book.sheets.RHD.get('C3')===null,'exportação sem realizado futuro');assert(book.sheets.Equipamentos.cells.B4.formula==='B2','fórmula preservada');assert(book.sheets.Equipamentos.get('B6')===.1,'cache percentual calculado');assert(book.sheets['Laboratório'].get('M2')===101,'último mês planejado');
 data.duration=24;for(const cat of categories)for(const [r,v]of Object.entries(data.values[cat]))while(v.length<24)v.push([3,11,16].includes(+r)?null:0);
 const extended=await openWorkbook(await (await exportWorkbook(data)).arrayBuffer());assert(extended.sheets.RHD.get('Y1')==='Mês 24','extensão até 24');assert(extended.sheets.RHD.cells.Y17.formula==='Y15+X17','fórmula mês 24');
 data.values.Equipamentos[2][0]=null;assert(missing(data)===1,'alteração volta a expor pendência');
 assert(pdfNumber('1.234,56')===1234.56&&pdfNumber('-')===0&&pdfNumber('R$ 10')===10&&pdfNumber('abc')===null&&pdfNumber('1.000')===1000,'números do PDF');
 const pages=await pdfPages(syntheticPur()),pur=parsePur(pages,{duration:12,start,file:'PUR_sintetico.pdf'});
 assert(pur.values.Equipamentos[2][0]===1000&&pur.values.Equipamentos[2][11]===1000,'PDF: rubrica e 12 meses');
 assert(pur.values.RHD[2][3]===12345.67,'PDF: rótulo quebrado em duas linhas');assert(pur.values.RHI[2][0]===500.5,'PDF: RH indireto');
 assert(pur.values.Correlatos[2][5]===0,'PDF: traço vale zero');assert(pur.values.Materiais[2][0]===null,'PDF: rubrica ausente fica pendente');
 assert(pur.values.RHD[15][0]===240&&pur.values.RHD[15][8]===160,'PDF: soma de horas por mês');assert(pur.values.RHD[10][0]===2&&pur.values.RHD[10][8]===1,'PDF: funções com horas > 0');
 assert(pur.values.RHI[15][0]===40&&pur.values.RHI[10][0]===1,'PDF: horas do RH indireto');assert(pur.text.includes('Pesquisador'),'PDF: texto para consulta');
 const merged=extract(fin,null,{project:'Sintético',start,duration:12,closed:1,pdf:pur});
 assert(merged.values.RHD[15][0]===240&&merged.values.Equipamentos[2][0]===1000&&merged.values.Equipamentos[3][0]===10,'PDF + financeiro sem planilha de apoio');
 const both=extract(fin,plan,{project:'Sintético',start,duration:12,closed:1,pdf:pur});assert(both.values.Equipamentos[2][0]===1000&&both.values.Materiais[2][0]===104,'PDF prevalece, planilha completa');assert(both.notices.some(n=>n.includes('divergem')),'divergência avisada');
 const rotated=parsePur([[{y:1,cells:[{x0:0,x1:5,xc:2,text:'Rubrica'},...Array.from({length:6},(_,i)=>({x0:100+i*40,x1:120+i*40,xc:110+i*40,text:['set/26','out/26','nov/26','dez/26','jan/27','fev/27'][i]}))],text:''},{y:0,cells:[{x0:0,x1:60,xc:30,text:'Materiais de consumo'},{x0:140,x1:160,xc:150,text:'7,5'}],text:''}]],{duration:12,start:month('2026-09')});
 assert(rotated.values.Materiais[2][1]===7.5,'PDF: cabeçalho jan/26 vira mês do projeto');
 const mesAno=['set/26','out/26','nov/26','dez/26','jan/27','fev/27'],semMes=makePdf([[{x:30,y:540,text:'Rubrica'},...mesAno.map((t,i)=>({x:200+i*50,y:540,text:t})),{x:30,y:525,text:'V - Materiais de consumo'},...mesAno.map((_,i)=>({x:200+i*50,y:525,text:'7,50'}))]]);
 const reread=await readPurPdf(new File([semMes],'PUR_mes_ano.pdf',{type:'application/pdf'}),{start:month('2026-09')});
 assert(reread.values.Materiais[2][1]===7.5,'PDF: segunda leitura não falha com buffer desanexado');
 const gantt=Array.from({length:8},(_,i)=>({x:200+i*50,y:540,text:'Mês '+(i+1)})),fisico=makePdf([[{x:30,y:540,text:'Macro atividade'},...gantt],[{x:30,y:540,text:'Rubrica'},...gantt.slice(0,6),{x:30,y:525,text:'V - Materiais de consumo'},...gantt.slice(0,6).map(g=>({x:g.x,y:525,text:'7,50'}))]]);
 const longo=await readPurPdf(new File([fisico],'PUR_fisico.pdf',{type:'application/pdf'}),{start:month('2026-09')});assert(longo.duration===6&&longo.notices.some(n=>n.includes('quadro financeiro')),'PDF: duração vem do quadro financeiro');
 assert(repairNumber('75.367.96')==='75367,96'&&repairNumber('75,367,96')==='75367,96'&&repairNumber('3 7l0,16')==='3710,16'&&repairNumber('—')==='-'&&repairNumber('160')==='160'&&repairNumber('Total')==='Total','OCR: números corrigidos');
 assert(repairNumber('1613148')==='16131,48'&&repairNumber('8632/75')==='8632,75'&&repairNumber('31.497,/6')==='31497,76'&&repairNumber('—.75.36/,96')==='75367,96'&&repairNumber('01/2026')==='01/2026'&&repairNumber('consumo;')==='consumo;','OCR: separador perdido e ruído');
 const rec=reconcile([100,795367.96,50],75517.96);assert(rec.ok&&rec.fixed.m===1&&rec.fixed.want===75367.96,'OCR: dígito a mais corrigido pela soma');assert(reconcile([100,200],300).ok&&!reconcile([100,200],900).ok,'OCR: soma confere ou avisa');assert(reconcile(Array(15).fill(3710.16),55652.43).ok&&!reconcile(Array(15).fill(3710.16),55652.43).fixed,'OCR: centavos de arredondamento não são erro');const round=reconcile([47476.4,795367.96,68690.24],191534.62);assert(round.ok&&round.fixed.m===1&&round.fixed.want===75367.96,'OCR: dígito a mais com arredondamento');
 assert(wordsToLines([{text:'3.839,16',x0:100,y0:100,x1:140,y1:110},{text:'3.720,16',x0:141,y0:100,x1:180,y1:110}],1,800)[0].cells.length===2,'OCR: números vizinhos não se juntam');
 const headCells=[['Rubrica',10],['Mês O1',100],['Més 02',140],['Mês 08',180],['Mês',220],['04',235],['Mês 05',260],['Mês 07',300],['TOTAL',340]].map(([text,x])=>({text,x0:x,x1:x+(text.length>3?28:10),xc:x+14}));
 const head=repairHeader({cells:headCells,text:''}).cells.map(c=>c.text);assert(head.join()==='Rubrica,Mês 01,Mês 02,Mês 03,Mês 04,Mês 05,Mês 06,TOTAL','OCR: cabeçalho reconstruído');
 const gap=repairHeader({cells:[100,140,220,260,300].map((x,i)=>({text:'Mês '+[1,2,4,5,6][i],x0:x,x1:x+28,xc:x+14})),text:''}).cells.map(c=>c.text);assert(gap.length===6&&gap[2]==='Mês 03','OCR: coluna perdida volta pelo espaçamento');
 const tail=repairHeader({cells:[100,140,180,220,['TOTAL',300]].map((x,i)=>Array.isArray(x)?{text:x[0],x0:x[1],x1:x[1]+28}:{text:'Mês '+(i+1),x0:x,x1:x+28,xc:x+14}),text:''}).cells.map(c=>c.text);assert(tail.length===6&&tail[4]==='Mês 05','OCR: última coluna perdida volta pelo Total');
 const cols=valueColumns([1,2,3].map(()=>({cells:[{text:'10,00',x1:100},{text:'20,00',x1:141},{text:'-',x1:180}]})));assert(cols.join()==='100,141,180','OCR: colunas pela borda direita');
 const tabela=wordsToLines([{text:'Rubricas',x0:100,y0:200,x1:160,y1:210},{text:'1.000,00',x0:200,y0:200,x1:240,y1:210}],1,800),esparsa=wordsToLines([{text:'Para:',x0:100,y0:150,x1:140,y1:165},{text:'Rubricas',x0:100,y0:200,x1:160,y1:210},{text:'1.234,00',x0:300,y0:300,x1:340,y1:310}],1,800);
 const titulos=addTitles(tabela,esparsa).map(l=>l.text);assert(titulos.join('|')==='Para:|Rubricas 1000,00','OCR: título solto recuperado da leitura esparsa, sem duplicar linhas nem trazer números');
 const stamp=Array.from({length:6},()=>[{text:'Assinado digitalmente por Fulano'}]);stamp[4]=[...stamp[4],{text:'x'.repeat(200)}];assert(textlessPages(stamp).join()==='0,1,2,3,5','OCR: carimbo repetido não conta como texto');
 assert(wordsToLines([{text:'Para:',x0:100,y0:100,x1:150,y1:120}],1,800)[0].text==='Para:','OCR: palavras viram linhas');
 const lido=(linhas,totais)=>({values:Object.fromEntries(categories.map(c=>[c,{2:[...(linhas[c]||[0,0])]}])),sources:Object.fromEntries(categories.map(c=>[c,{2:(linhas[c]||[0,0]).map(()=>'scan.pdf, p. 1')}])),totals:totais,notices:[],duration:(linhas.RHD||[0,0]).length});
 const totalErrado=lido({RHD:[100,200]},{RHD:3000});reviewOcr(totalErrado,'scan.pdf',1);
 assert(totalErrado.values.RHD[2].join()==='100,200'&&totalErrado.notices.some(n=>n.includes('RHD')&&n.includes('dígito do total')),'OCR: total lido com dígito errado gera aviso e mantém os meses');
 const vazias=lido({RHD:[100,null,200],STT:[null,50,null]},{RHD:300,STT:50});reviewOcr(vazias,'scan.pdf',1);const avisoVazias=vazias.notices.find(n=>n.includes('sem leitura'))||'';
 assert(vazias.values.RHD[2][1]===0&&vazias.values.STT[2].join()==='0,50,0'&&avisoVazias.includes('3 células')&&avisoVazias.includes('RHD (mês 2)')&&avisoVazias.includes('STT (meses 1, 3)'),'OCR: células sem leitura viram zero com aviso geral de quantas e onde');
 const linha=(y,label,vals)=>[{x:30,y,text:label},...vals.map((v,i)=>({x:200+i*60,y,text:v}))];
 const sete=['I - Programas de computador','II - Laboratório','III a - Recursos humanos diretos','III b - Recursos humanos indiretos','V - Materiais de consumo','VIII - Serviços técnicos de terceiros','IX - Outros correlatos'];
 const quadro=[...linha(540,'Rubricas',['Mês 1','Mês 2','Mês 3','Mês 4','TOTAL']),...sete.flatMap((l,i)=>linha(525-i*15,l,['100,00','100,00','100,00','100,00','400,00'])),
  ...linha(420,'VI - Viagens',['50,00','-','-','-','50,00']),...linha(405,'VII - Treinamento',['-','-','25,00','-','25,00']),...linha(390,'Sub-Total',['750,00','700,00','725,00','790,00','2.965,00'])];
 const sub=parsePur(await pdfPages(makePdf([quadro])),{duration:4,start,file:'sub.pdf'});
 assert(sub.subtotals.join()==='750,700,725,790'&&sub.others.Viagens.join()==='50,0,0,0'&&sub.others.Treinamento[2]===25&&sub.otherTotals.Viagens===50,'PDF: Sub-Total e rubricas fora do relatório lidos por mês');
 const conf=checkSubtotals(sub);const avisoSub=sub.notices.find(n=>n.includes('Sub-Total'))||'';
 assert(conf.checked===4&&conf.bad===1&&avisoSub.includes('mês 4 (soma 700,00, Sub-Total 790,00)')&&!avisoSub.includes('mês 1 ')&&sub.values.RHD[2][3]===100,'PDF: mês divergente do Sub-Total vira aviso sem alterar valores');
 const info=financialInfo(fin);assert(info.project==='Projeto sintético'&&info.start===month(46266)&&info.lastClosed===month(46266),'financeiro: projeto, início e última competência realizada');
 assert(durationFromText('Prazo de execução: 15 (quinze) meses')===15&&durationFromText('A duração do projeto é de 12 meses')===12&&durationFromText('Mês 1 Mês 2')===null&&durationFromText('prazo de 30 dias')===null,'duração lida do texto do PUR');
 const auto=parsePur(pages,{start,file:'PUR_sintetico.pdf'});assert(auto.duration===12&&auto.values.Equipamentos[2].length===12,'duração deduzida do cronograma quando o texto não informa');
 const withText=parsePur([[...pages[0],{y:0,cells:[{x0:0,x1:10,xc:5,text:'Prazo de execução: 9 meses'}],text:'Prazo de execução: 9 meses'}],pages[1]],{start,file:'x.pdf'});assert(withText.duration===9&&withText.values.RHD[15].length===9,'duração do texto prevalece e corta os meses excedentes');
 // OCR real: quadro desenhado no canvas, lido pelo Tesseract; células apagadas da leitura voltam pela releitura de fillGaps.
 {const {default:Tesseract}=await import('./vendor/tesseract.esm.min.js'),B=new URL('./vendor/',location.href).href,S=5;
  const worker=await Tesseract.createWorker('por',1,{workerPath:B+'worker.min.js',corePath:B+'tesseract-core-simd-lstm.wasm.js',langPath:B.replace(/\/$/,''),gzip:true,cacheMethod:'none',workerBlobURL:false});
  try{const canvas=document.createElement('canvas');canvas.width=620*S;canvas.height=130*S;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';ctx.font=`${7*S}px Arial`;
   const grade=Array.from({length:5},(_,r)=>Array.from({length:8},(_,c)=>((r*7919+c*104729)%90000+1000+((r*31+c*17)%100)/100)));
   grade.forEach((vals,r)=>{const y=(30+r*18)*S;ctx.textAlign='left';ctx.fillText('Rubrica '+'ABCDE'[r],10*S,y);ctx.textAlign='right';vals.forEach((v,c)=>ctx.fillText(v.toLocaleString('pt-BR',{minimumFractionDigits:2}),(150+c*60)*S,y));});
   await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1',user_defined_dpi:'300'});
   const {data}=await worker.recognize(canvas,{},{blocks:true,text:false});
   const words=data.blocks.flatMap(b=>b.paragraphs).flatMap(p=>p.lines).flatMap(l=>l.words).map(w=>({text:w.text,...w.bbox}));
   const lines=wordsToLines(words,S,canvas.height).filter(l=>l.cells.length>=8),txt=v=>v.toFixed(2).replace('.',',');
   const lost=[[0,2],[1,7],[3,0],[4,5]];
   assert(lines.length===5&&lost.every(([r,c])=>lines[r].cells.some(x=>x.text===txt(grade[r][c]))),'OCR: quadro de teste lido');
   for(const [r,c] of lost){const i=lines[r].cells.findIndex(x=>x.text===txt(grade[r][c]));lines[r].cells.splice(i,1);}
   await fillGaps(worker,canvas,lines,S);
   assert(lost.every(([r,c])=>lines[r].cells.some(x=>x.text===txt(grade[r][c])&&Math.abs(x.x1-(150+c*60))<=4)),'OCR: células perdidas voltam pela releitura de fillGaps');
   assert(lines.every((l,r)=>l.cells.filter(x=>/\d,\d{2}$/.test(x.text)).length===8),'OCR: fillGaps não inventa células');
  }finally{await worker.terminate();}}
 out.textContent=`PASSOU — ${passed} verificações.\nExtração, salário versus horas, CPF duplicado, competências, ausência versus zero, bloqueio, cálculos, exportação 12/24 meses e leitura do PUR em PDF.`;document.body.dataset.result='passed';
}catch(e){out.textContent=`FALHOU após ${passed} verificações: ${e.stack}`;document.body.dataset.result='failed';}
