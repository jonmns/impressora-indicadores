/* Tela de resolução de uma confirmação: à esquerda, a imagem de onde o valor foi tirado (página do PDF com o valor
 * destacado, ou o trecho da planilha); à direita, o que o sistema leu, editável. Salvar grava os ajustes como
 * "Ajuste manual na conferência" e responde a confirmação (Corrigido se algo mudou, Confirmado se não). */
import {inputRows,cellsForCheck,sourceRef,number,answerCheck} from './engine.js';

const $=id=>document.getElementById(id);
const el=(tag,props={},...kids)=>{const e=Object.assign(document.createElement(tag),props);e.append(...kids);return e;};
const brl=v=>v===null?'':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(v);
let pdfDoc=null,pdfFile=null;

async function loadPdf(file){
 if(pdfFile===file&&pdfDoc)return pdfDoc;
 const pdfjs=await import('./vendor/pdf.min.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
 await pdfDoc?.destroy();
 pdfDoc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,enableXfa:false,verbosity:0}).promise;
 pdfDoc.pdfjs=pdfjs;pdfFile=file;return pdfDoc;
}

/* Formas como um valor aparece impresso no PUR: "12.345,67", "12345,67", "160". */
function printed(v){
 if(v===null||!Number.isFinite(v))return [];
 const two=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
 const out=[two,two.replace(/\./g,'')];if(Number.isInteger(v))out.push(String(v),new Intl.NumberFormat('pt-BR').format(v));
 return out;
}

/* Destaque: entre os textos iguais ao valor, fica o da linha da rubrica (rótulo da fonte) e da coluna do mês ("Mês N"). */
async function drawPdf(box,file,page,value,ocr,hint={}){
 box.replaceChildren(el('p',{className:'help',textContent:`Carregando a página ${page} do PUR…`}));
 const doc=await loadPdf(file);if(page<1||page>doc.numPages)throw Error(`O PDF não tem a página ${page}.`);
 const pg=await doc.getPage(page),base=pg.getViewport({scale:1}),scale=Math.min(2,1100/base.width),vp=pg.getViewport({scale});
 const canvas=el('canvas',{width:Math.ceil(vp.width),height:Math.ceil(vp.height)}),ctx=canvas.getContext('2d');
 await pg.render({canvasContext:ctx,viewport:vp,intent:'print'}).promise;
 let marks=0;
 if(!ocr&&value!==null){
  const wanted=printed(value),{items}=await pg.getTextContent(),norm=x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const box_=it=>{const t=doc.pdfjs.Util.transform(vp.transform,it.transform),h=Math.hypot(t[2],t[3]);return {x:t[4],y:t[5]-h,w:it.width*scale,h};};
  let hits=items.filter(it=>wanted.includes(it.str.replace(/\s/g,'').replace(/^R\$/,''))).map(box_);
  const lab=hint.label?norm(hint.label).slice(0,18):'',row=lab&&items.find(it=>it.str.trim().length>2&&norm(lab).startsWith(norm(it.str).slice(0,18))||lab&&norm(it.str).startsWith(lab));
  if(row){const r=box_(row),same=hits.filter(b=>Math.abs((b.y+b.h/2)-(r.y+r.h/2))<Math.max(r.h,b.h));if(same.length)hits=same;}
  const head=Number.isInteger(hint.month)&&items.find(it=>new RegExp(`^(m[eê]s|m)\\s*0?${hint.month+1}$`,'i').test(it.str.trim()));
  if(head&&hits.length>1){const hx=box_(head),cx=hx.x+hx.w/2;hits=[hits.reduce((a,b)=>Math.abs(b.x+b.w/2-cx)<Math.abs(a.x+a.w/2-cx)?b:a)];}
  for(const b of hits){ctx.fillStyle='rgba(245,179,1,.35)';ctx.strokeStyle='#b77a00';ctx.lineWidth=3;ctx.fillRect(b.x-4,b.y-4,b.w+8,b.h+8);ctx.strokeRect(b.x-4,b.y-4,b.w+8,b.h+8);marks++;}
  if(hits[0])setTimeout(()=>canvas.parentElement?.scrollTo({left:Math.max(0,hits[0].x*canvas.clientWidth/canvas.width-120),top:Math.max(0,hits[0].y*canvas.clientHeight/canvas.height-120),behavior:'smooth'}),50);
 }
 const note=ocr?'Página digitalizada: o valor foi lido por OCR. Localize-o na imagem e compare com o valor lido ao lado.'
  :marks?`${marks===1?'O valor lido está destacado em amarelo.':`O valor lido está destacado em amarelo (${marks} lugares possíveis na página).`}`
  :'O valor lido não aparece escrito igual nesta página. Compare com a imagem.';
 const wrap=el('div',{className:'rv-canvas'},canvas),zoom=el('div',{className:'rv-zoom'});
 let level=1;const apply=()=>{canvas.style.width=`${Math.round(level*100)}%`;};
 for(const [t,f] of [['−',()=>level=Math.max(.5,level-.25)],['Ajustar',()=>level=1],['+',()=>level=Math.min(4,level+.25)]]){const b=el('button',{type:'button',className:'secondary',textContent:t});b.addEventListener('click',()=>{f();apply();});zoom.append(b);}
 apply();
 box.replaceChildren(el('div',{className:'rv-bar'},el('p',{className:'rv-note',textContent:`PUR, página ${page}. ${note}`}),zoom),wrap);
}

const colNum=c=>[...c].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);
const colName=n=>{let s='';for(;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
function drawSheet(box,book,ref){
 const sheet=Object.values(book?.sheets||{}).find(s=>s.name===ref.sheet);
 if(!sheet){box.replaceChildren(el('p',{className:'help',textContent:`A aba ${ref.sheet} não está disponível para visualização.`}));return;}
 const c0=colNum(ref.col),table=el('table',{className:'rv-sheet'}),head=table.createTHead().insertRow();
 head.append(el('th'));for(let c=Math.max(1,c0-3);c<=c0+3;c++)head.append(el('th',{textContent:colName(c)}));
 const body=table.createTBody();
 for(let r=Math.max(1,ref.row-4);r<=ref.row+4;r++){const tr=body.insertRow();tr.append(el('th',{textContent:String(r)}));
  for(let c=Math.max(1,c0-3);c<=c0+3;c++){const v=sheet.get(colName(c)+r);const td=tr.insertCell();td.textContent=typeof v==='number'?brl(v):(v??'');if(r===ref.row&&c===c0)td.className='rv-hit';}}
 box.replaceChildren(el('p',{className:'rv-note',textContent:`Planilha financeira, aba ${ref.sheet}, célula ${ref.col}${ref.row} (destacada).`}),el('div',{className:'rv-sheetwrap'},table));
}

/* ctx: {data, files:{financial, pur}, onDone(message)} */
export function openResolver(check,ctx){
 const {data}=ctx,dlg=$('resolver'),cells=cellsForCheck(check,data);
 const label=c=>`${c.cat} · ${inputRows[c.row]} · M${c.m+1}`;
 const preview=el('div',{className:'rv-preview'}),list=el('div',{className:'rv-list'});
 const inputs=[];let current=-1;
 async function show(i){
  current=i;list.querySelectorAll('tr[data-i]').forEach(tr=>tr.classList.toggle('rv-active',+tr.dataset.i===i));
  const c=cells[i],src=c?data.sources[c.cat][c.row][c.m]:null,ref=c?sourceRef(src):sourcePage(check.text);
  try{
   if(ref?.kind==='pdf'&&ctx.files.pur&&/\.pdf$/i.test(ctx.files.pur.name))await drawPdf(preview,ctx.files.pur,ref.page,c?data.values[c.cat][c.row][c.m]:null,ref.ocr,{label:(src||'').match(/linha "([^"]+)"/)?.[1],month:c?.m});
   else if(ref?.kind==='sheet')drawSheet(preview,ctx.files.financial,ref);
   else preview.replaceChildren(el('p',{className:'rv-note',textContent:c?`Fonte registrada: ${src||'não identificada'}. Não há imagem para esta fonte.`:'Este ponto não aponta uma página ou célula específica. Leia o aviso e confirme, ou feche e corrija na tabela.'}));
  }catch(e){preview.replaceChildren(el('p',{className:'error',textContent:'Não foi possível mostrar a fonte: '+(e.message||e)}));}
 }
 if(cells.length){
  const table=el('table',{className:'rv-table'});
  table.createTHead().insertRow().append(...['Valor','Lido pelo sistema','Fonte'].map(t=>el('th',{textContent:t})));
  const body=table.createTBody();
  cells.forEach((c,i)=>{const v=data.values[c.cat][c.row][c.m],tr=body.insertRow();tr.dataset.i=i;
   const input=el('input',{type:'text',inputMode:'decimal',value:v===null?'':String(v).replace('.',','),id:`rv-${i}`});input.setAttribute('aria-label',label(c));
   input.addEventListener('focus',()=>{if(current!==i)show(i);});inputs.push(input);
   tr.append(el('th',{textContent:label(c)}),el('td',{},input),el('td',{className:'rv-src',textContent:data.sources[c.cat][c.row][c.m]||''}));
   tr.addEventListener('click',e=>{if(e.target!==input&&current!==i)show(i);});});
  list.append(el('p',{className:'help',textContent:'Clique numa linha para ver a fonte. Corrija o valor no campo, se a leitura estiver errada.'}),el('div',{className:'rv-tablewrap'},table));
 }else list.append(el('p',{className:'help',textContent:'Nenhuma célula específica está ligada a este aviso.'}));
 const msg=el('p',{className:'rv-msg',role:'alert'});
 const save=el('button',{type:'button',className:'primary',textContent:'Salvar e resolver'}),cancel=el('button',{type:'button',className:'secondary',textContent:'Cancelar'});
 cancel.addEventListener('click',()=>dlg.close());
 save.addEventListener('click',()=>{
  try{
   const edits=[];
   cells.forEach((c,i)=>{const n=number(inputs[i].value),old=data.values[c.cat][c.row][c.m];
    if(n!==null&&n<0)throw Error(`${label(c)}: valores negativos exigem conferência na origem.`);
    if([10,11].includes(c.row)&&n!==null&&!Number.isInteger(n))throw Error(`${label(c)}: profissionais deve ser inteiro.`);
    if(n!==old&&!(n!==null&&old!==null&&Math.abs(n-old)<.005))edits.push([c,n]);});
   for(const [c,n] of edits){data.values[c.cat][c.row][c.m]=n;data.sources[c.cat][c.row][c.m]=`Ajuste manual na conferência (fonte anterior: ${data.sources[c.cat][c.row][c.m]})`;}
   answerCheck(data,check.id,edits.length?'corrigido':'confirmado');
   if(edits.length)check.edits=edits.map(([c,n])=>({cell:label(c),value:n}));
   dlg.close();ctx.onDone(edits.length?`${edits.length} ${edits.length===1?'valor corrigido':'valores corrigidos'} e confirmação resolvida.`:'Leitura confirmada sem alterações.');
  }catch(e){msg.textContent=e.message;}
 });
 dlg.replaceChildren(
  el('div',{className:'rv-head'},el('h2',{textContent:'Resolver confirmação'}),el('p',{textContent:check.text})),
  el('div',{className:'rv-body'},preview,list),
  el('div',{className:'rv-foot'},msg,cancel,save));
 dlg.showModal();show(cells.length?0:-1);
}
function sourcePage(text){const m=String(text).match(/\bp(?:ágina|\.)\s*(\d+)/i);return m?{kind:'pdf',page:+m[1],ocr:false}:null;}
