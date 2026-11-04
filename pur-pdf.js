/* Leitor de PUR / adendo em PDF. Usa a camada de texto do PDF (sem OCR) e reconstrói linhas e colunas pela posição. */
import {categories,norm,rubrica,durationFromText} from './engine.js';

let pdfjs=null;
async function loadPdfjs(){
 if(!pdfjs){pdfjs=await import('./vendor/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;}
 return pdfjs;
}

/* Lê o PDF e devolve páginas com linhas; cada linha tem células {x0,x1,xc,text}. */
export async function pdfPages(buffer){
 const lib=await loadPdfjs();
 const doc=await lib.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,enableXfa:false,disableFontFace:true,useSystemFonts:false,verbosity:0}).promise;
 if(doc.numPages>300)throw Error('PDF com mais de 300 páginas.');
 const pages=[];
 for(let p=1;p<=doc.numPages;p++){
  const page=await doc.getPage(p),content=await page.getTextContent();
  const items=content.items.filter(i=>typeof i.str==='string'&&i.str.trim()).map(i=>({text:i.str,x:i.transform[4],y:i.transform[5],w:i.width||0,h:Math.abs(i.transform[3])||i.height||8}));
  pages.push(linesFromItems(items));page.cleanup();
 }
 await doc.destroy();return pages;
}

/* Agrupa itens por linha (y) e junta itens próximos em células (x). Exportada para testes. */
export function linesFromItems(items){
 const sorted=[...items].sort((a,b)=>b.y-a.y||a.x-b.x),lines=[];
 for(const it of sorted){const tol=Math.max(2,it.h*.45);let line=lines.find(l=>Math.abs(l.y-it.y)<=tol);if(!line){line={y:it.y,items:[]};lines.push(line);}line.items.push(it);}
 lines.sort((a,b)=>b.y-a.y);
 return lines.map(l=>{
  const its=l.items.sort((a,b)=>a.x-b.x),cells=[];
  for(const it of its){const last=cells[cells.length-1],gap=last?it.x-last.x1:Infinity;
   if(last&&gap<Math.max(3,it.h*.55)){last.text+=(gap>it.h*.12&&!last.text.endsWith(' ')?' ':'')+it.text;last.x1=Math.max(last.x1,it.x+it.w);}
   else cells.push({x0:it.x,x1:it.x+it.w,text:it.text});}
  for(const c of cells){c.text=c.text.replace(/\s+/g,' ').trim();c.xc=(c.x0+c.x1)/2;}
  return {y:l.y,cells:cells.filter(c=>c.text),text:cells.map(c=>c.text).join(' ').replace(/\s+/g,' ').trim()};
 });
}

/* Número em formato brasileiro. Traço conta como zero. Retorna null quando não é número. */
export function pdfNumber(text){
 let t=String(text).replace(/R\$| |\s/g,'');
 if(/^[-–—]$/.test(t))return 0;
 if(!/^-?\(?[\d.]+(,\d+)?\)?$/.test(t))return null;
 const neg=t.startsWith('-')||t.startsWith('(');t=t.replace(/[-()]/g,'');
 if(t.includes(','))t=t.replace(/\./g,'').replace(',','.');else if(/^\d{1,3}(\.\d{3})+$/.test(t))t=t.replace(/\./g,'');
 const n=Number(t);return Number.isFinite(n)?(neg?-n:n):null;
}

const MONTHS=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
/* Índice de mês do projeto (0 = Mês 1) representado pelo texto de um cabeçalho, ou null. */
function headerMonth(text,start){
 const s=norm(text).replace(/[ºª°.]/g,'');let m;
 if((m=s.match(/^(?:mes|m)\s*0?(\d{1,2})$/)))return +m[1]-1;
 if((m=s.match(/^0?(\d{1,2})\s*mes$/)))return +m[1]-1;
 if(start!=null){
  if((m=s.match(/^([a-z]{3})[a-z]*\s*[/-]\s*(\d{2}|\d{4})$/))&&MONTHS.includes(m[1])){const y=+m[2]<100?2000+ +m[2]:+m[2];return y*12+MONTHS.indexOf(m[1])-start;}
  if((m=s.match(/^(\d{1,2})\s*[/-]\s*(\d{4})$/))&&+m[1]>=1&&+m[1]<=12){return +m[2]*12+ +m[1]-1-start;}
 }
 return null;
}

/* Detecta uma linha de cabeçalho com meses. Aceita "Mês 1", "M1", "1º mês", "jan/26", "01/2026" ou inteiros consecutivos. */
function detectHeader(line,start){
 let cols=line.cells.map(c=>({m:headerMonth(c.text,start),xc:c.xc,x0:c.x0,x1:c.x1})).filter(c=>c.m!==null&&c.m>=0&&c.m<60);
 if(cols.length<4){
  const ints=line.cells.filter(c=>/^\d{1,2}$/.test(c.text.trim())).map(c=>({m:+c.text-1,xc:c.xc,x0:c.x0,x1:c.x1}));
  let run=[];for(const c of ints){if(run.length&&c.m===run[run.length-1].m+1)run.push(c);else run=[c];if(run.length>=6)cols=run.slice();}
  if(cols.length<6)return null;
 }
 const ms=cols.map(c=>c.m);if(new Set(ms).size!==ms.length)return null;
 for(let i=1;i<ms.length;i++)if(ms[i]<=ms[i-1])return null;
 const gaps=cols.slice(1).map((c,i)=>c.xc-cols[i].xc).sort((a,b)=>a-b);
 const spacing=gaps[Math.floor(gaps.length/2)]||40,last=cols[cols.length-1];
 // A última coluna termina antes de um cabeçalho seguinte (ex.: Total) ou meia coluna depois do cabeçalho.
 const after=line.cells.filter(c=>c.x0>last.x1+1).map(c=>c.x0);
 return {cols,spacing,firstX:Math.min(...cols.map(c=>c.x0)),lastX:Math.min(last.x1+spacing*.75,...after.map(x=>x+1))};
}

/* Números de tabela costumam ser alinhados à direita: o mês é a coluna cujo intervalo contém a borda direita do número.
   O intervalo vai do início do cabeçalho do mês até o início do cabeçalho seguinte. */
function columnOf(header,cell){
 const cols=header.cols;
 for(let i=0;i<cols.length;i++){const lo=cols[i].x0-3,hi=i+1<cols.length?cols[i+1].x0+1:header.lastX;if(cell.x1>lo&&cell.x1<=hi)return cols[i].m;}
 return null;
}

const isTotal=s=>/^(sub\s*)?total/.test(norm(s));

/* Interpreta as linhas do PDF e devolve valores planejados por rubrica e mês. Função pura, testável sem PDF. */
export function parsePur(pages,{duration:given,start,file='PUR.pdf'}){
 const duration=given||24,values={},sources={},notices=[];
 for(const cat of categories){values[cat]={2:Array(duration).fill(null)};sources[cat]={2:Array(duration).fill(null)};if(cat==='RHD'||cat==='RHI')for(const r of [10,15]){values[cat][r]=Array(duration).fill(null);sources[cat][r]=Array(duration).fill(null);}}
 const functions={RHD:new Map(),RHI:new Map()},seen=new Set();let headers=0,hoursTables=0;
 pages.forEach((lines,p)=>{
  let header=null,kind='money',group=null,pending='';
  lines.forEach((line,i)=>{
   const h=detectHeader(line,start);
   if(h){header=h;headers++;pending='';
    const context=lines.slice(Math.max(0,i-4),i+1).map(l=>norm(l.text)).join(' ');
    kind=/\bhoras?\b|h\/mes|\bhh\b|carga horaria/.test(context)?'hours':'money';
    group=null;for(const l of lines.slice(Math.max(0,i-4),i+1)){const r=rubrica(l.text);if(r==='RHD'||r==='RHI')group=r;}
    if(kind==='hours')hoursTables++;return;}
   if(!header)return;
   const nums=[],label=[];
   for(const c of line.cells){const n=pdfNumber(c.text);const m=n===null?null:columnOf(header,c);
    if(m!==null)nums.push({m,n});else if(c.x1<header.firstX+header.spacing*.3&&!/^r\$$/i.test(c.text))label.push(c.text);}
   const own=label.join(' ').trim();
   if(!nums.length){
    if(own.length>90){header=null;return;}
    const r=rubrica(own);if(kind==='hours'&&(r==='RHD'||r==='RHI'))group=r;else if(kind==='hours'&&r)group=null;
    pending=own;return;}
   const next=lines[i+1],nextLabel=next&&!next.cells.some(c=>pdfNumber(c.text)!==null)?next.cells.filter(c=>c.x1<header.firstX).map(c=>c.text).join(' '):'';
   const candidates=[own,`${pending} ${own}`,`${own} ${nextLabel}`,`${pending} ${own} ${nextLabel}`].map(s=>s.trim()).filter(Boolean);
   const where=`${file}, p. ${p+1}`;
   if(isTotal(own)){pending='';if(kind==='hours')group=null;return;}
   if(kind==='money'){
    const cat=candidates.map(rubrica).find(Boolean);pending='';if(!cat)return;
    for(const {m,n} of nums){if(m>=duration)continue;const key=`${cat}|${m}`;
     if(seen.has(key)){if(values[cat][2][m]!==n)notices.push(`${cat}, mês ${m+1}: o PDF tem mais de um valor planejado (${values[cat][2][m]} e ${n}). Foi mantido o primeiro; confira.`);continue;}
     seen.add(key);values[cat][2][m]=n;sources[cat][2][m]=`${where}, linha "${candidates.find(c=>rubrica(c)===cat)}"`;}
    return;}
   // Tabela de horas: linha de rubrica muda o grupo; demais linhas são funções. Só o rótulo da própria linha conta.
   const cat=rubrica(own||pending);
   if(cat==='RHD'||cat==='RHI'){group=cat;pending='';return;}
   if(cat){group=null;pending='';return;}
   if(!group){pending='';return;}
   const name=(own||pending||'Função sem nome').trim();pending='';
   const key=norm(name)+'|'+p+'|'+i,row={name,where:`${where}, "${name}"`,hours:new Map()};
   for(const {m,n} of nums)if(m<duration)row.hours.set(m,(row.hours.get(m)||0)+n);
   functions[group].set(key,row);
  });
 });
 for(const cat of ['RHD','RHI']){const rows=[...functions[cat].values()];if(!rows.length)continue;
  for(let m=0;m<duration;m++){let sum=0,any=false;const people=new Set(),refs=[];
   for(const r of rows){if(r.hours.has(m)){any=true;const v=r.hours.get(m);sum+=v;if(v>0)people.add(norm(r.name));refs.push(r.name);}}
   if(!any)continue;
   values[cat][15][m]=sum;sources[cat][15][m]=`${file}: soma das horas do mês (${refs.join('; ')})`;
   values[cat][10][m]=people.size;sources[cat][10][m]=`${file}: funções distintas com horas > 0; conferir vagas com a mesma função`;}
  notices.push(`${cat}: profissionais previstos no PDF foram contados por função distinta. Confira se há duas ou mais vagas com a mesma função.`);}
 const text=pages.map((lines,p)=>`— Página ${p+1} —\n`+lines.map(l=>l.text).join('\n')).join('\n\n');
 if(!text.replace(/— Página \d+ —/g,'').trim())notices.push('O PDF não tem camada de texto (parece digitalizado). OCR não está disponível: use a versão digital do PUR ou a planilha de apoio.');
 else if(!headers)notices.push('Não encontrei no PDF uma tabela com cabeçalho mensal (Mês 1, M1, jan/26…). Complete o planejado na conferência ou envie a planilha de apoio.');
 else if(!hoursTables)notices.push('O PDF não tem quadro de horas por mês reconhecido. Horas e profissionais previstos ficam pendentes, a menos que a planilha de apoio os traga.');
 let detected=given||null;
 if(!given){
  // A duração vem do próprio PUR: texto "prazo/duração de N meses"; sem texto, o último mês com valor planejado diferente de zero.
  let last=-1;for(const cat of categories)for(const row of Object.keys(values[cat]))values[cat][row].forEach((v,m)=>{if(v!==null&&v!==0)last=Math.max(last,m);});
  const fromText=durationFromText(text);
  if(fromText){detected=fromText;if(last+1>fromText)notices.push(`O PUR informa ${fromText} meses, mas há valores planejados até o mês ${last+1}. Confira a duração.`);}
  else if(last>=0){detected=last+1;notices.push(`Duração deduzida do cronograma do PUR: ${detected} meses (o texto não informa o prazo). Confira.`);}
  if(detected){for(const cat of categories)for(const row of Object.keys(values[cat])){values[cat][row].length=detected;sources[cat][row].length=detected;}}
 }
 return {values,sources,notices:[...new Set(notices)],text,duration:detected};
}

export async function readPurPdf(file,options){return parsePur(await pdfPages(await file.arrayBuffer()),{...options,file:file.name});}
