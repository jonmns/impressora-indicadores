/* OCR local para PUR digitalizado. Tudo roda no navegador, com arquivos de vendor/; o documento não sai da máquina.
 * Fluxo: passada rápida em todas as páginas sem texto para achar orientação, marcadores e quadros mensais;
 * depois releitura em alta resolução só das páginas com quadro mensal. */
import {linesFromItems} from './pur-pdf.js';

const BASE=new URL('./vendor/',import.meta.url).href,FAST=3,FINE=5;
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

/* Índices das páginas sem texto útil. Linhas repetidas na maioria das páginas (carimbo de assinatura) não contam. */
export function textlessPages(pages,minChars=40){
 const count=new Map();
 for(const lines of pages)for(const t of new Set(lines.map(l=>l.text)))count.set(t,(count.get(t)||0)+1);
 const limit=Math.max(3,pages.length*.5),stamp=t=>count.get(t)>=limit||/assinad[oa]\s+(digital|eletronic)/i.test(norm(t));
 return pages.flatMap((lines,i)=>lines.filter(l=>!stamp(l.text)).map(l=>l.text).join('').replace(/\s/g,'').length<minChars?[i]:[]);
}

/* Corrige um número lido por OCR. Valores com centavos têm sempre dois dígitos no fim; o separador pode vir trocado. */
export function repairNumber(text){
 const t=String(text).replace(/[|[\]{}!]/g,'').trim();
 if(/^[-–—~_=.]{1,3}$/.test(t))return '-';
 if(!/^[\dOoIlSB.,\s]+$/.test(t)||!/\d/.test(t))return t;
 const fixed=t.replace(/[Oo]/g,'0').replace(/[Il]/g,'1').replace(/S/g,'5').replace(/B/g,'8').replace(/\s/g,'');
 if(!/[.,]\d{2}$/.test(fixed))return fixed;
 const d=fixed.replace(/\D/g,'');return d.slice(0,-2)+','+d.slice(-2);
}

/* Reconstrói o cabeçalho mensal. O OCR pode separar "Mês" de "01", trocar um dígito ou perder uma coluna inteira.
 * Como os meses são consecutivos, a numeração sai da ordem e do espaçamento das colunas. */
export function repairHeader(line){
 const found=[],rest=[],cells=line.cells;
 for(let i=0;i<cells.length;i++){const c=cells[i],t=norm(c.text).replace(/[ºª°.:]/g,'');
  const digits=x=>+x.replace(/o/g,'0').replace(/[lit]/g,'1').replace(/s/g,'5');
  let m=t.match(/^m\S{0,3}\s+([\dolits]{1,2})$/)||t.match(/^m\S{1,3}?(\d{1,2})$/);
  if(m){found.push({n:digits(m[1]),x0:c.x0,x1:c.x1});continue;}
  const after=norm(cells[i+1]?.text);
  if(/^m\S{1,3}$/.test(t)&&/^[\dolits]{1,2}$/.test(after)){found.push({n:digits(after),x0:c.x0,x1:cells[i+1].x1});i++;continue;}
  rest.push(c);}
 if(found.length<4)return line;
 found.sort((a,b)=>a.x0-b.x0);
 const gaps=found.slice(1).map((c,i)=>c.x0-found[i].x0).sort((a,b)=>a-b),step=gaps[Math.floor(gaps.length/2)];
 found[0].rank=0;for(let i=1;i<found.length;i++)found[i].rank=found[i-1].rank+Math.max(1,Math.round((found[i].x0-found[i-1].x0)/step));
 const votes=new Map();for(const c of found){const o=c.n-c.rank;votes.set(o,(votes.get(o)||0)+1);}
 const offset=[...votes].sort((a,b)=>b[1]-a[1])[0][0],out=[];
 for(let i=0;i<found.length;i++){const c=found[i],w=c.x1-c.x0;out.push({x0:c.x0,x1:c.x1,n:offset+c.rank});
  const next=found[i+1];if(next)for(let r=c.rank+1;r<next.rank;r++){const x=c.x0+(next.x0-c.x0)*(r-c.rank)/(next.rank-c.rank);out.push({x0:x,x1:x+w,n:offset+r});}}
 const heads=out.map(c=>({x0:c.x0,x1:c.x1,xc:(c.x0+c.x1)/2,text:'Mês '+String(c.n).padStart(2,'0')}));
 const all=[...rest,...heads].sort((a,b)=>a.x0-b.x0);
 return {...line,cells:all,text:all.map(c=>c.text).join(' ')};
}

/* Converte palavras do OCR em linhas no mesmo formato do leitor de PDF. Coordenadas em pontos, com y crescendo para cima. */
export function wordsToLines(words,scale,height){
 const items=words.map(w=>({text:w.text,x:w.x0/scale,y:(height-w.y1)/scale,w:(w.x1-w.x0)/scale,h:Math.max(1,(w.y1-w.y0)/scale)})).filter(i=>i.text.trim());
 return linesFromItems(items).map(line=>{
  const cells=line.cells.map(c=>({...c,text:repairNumber(c.text)})).filter(c=>c.text);
  return repairHeader({...line,cells,text:cells.map(c=>c.text).join(' ')});
 });
}

const wordsOf=data=>(data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]).flatMap(l=>l.words||[]).map(w=>({text:w.text,conf:w.confidence,...w.bbox})).filter(w=>w.conf>=30);
const quality=words=>words.filter(w=>w.conf>=75&&/[\p{L}\d]{3}/u.test(w.text)).reduce((s,w)=>s+w.text.length,0);

/* Texto deitado concentra a tinta em colunas, não em linhas. */
function looksSideways(canvas){
 const k=4,w=Math.floor(canvas.width/k),h=Math.floor(canvas.height/k),small=document.createElement('canvas');small.width=w;small.height=h;
 const ctx=small.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,w,h);const px=ctx.getImageData(0,0,w,h).data;
 const rows=new Float64Array(h),cols=new Float64Array(w),mx=Math.floor(w*.1),my=Math.floor(h*.1);
 for(let y=my;y<h-my;y++)for(let x=mx;x<w-mx;x++){const v=255-px[(y*w+x)*4+1];rows[y]+=v;cols[x]+=v;}
 const spread=a=>{const v=[...a].filter(Boolean);if(!v.length)return 0;const m=v.reduce((s,x)=>s+x,0)/v.length;return v.reduce((s,x)=>s+(x-m)**2,0)/v.length/(m*m||1);};
 return spread(cols)>spread(rows)*1.2;
}

async function render(page,scale,rotation){
 const viewport=page.getViewport({scale,rotation:(page.rotate+rotation)%360}),canvas=document.createElement('canvas');
 canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillText=()=>{}; // O único texto real destas páginas é o carimbo de assinatura, que costuma passar por cima dos quadros.
 await page.render({canvasContext:ctx,viewport}).promise;
 return canvas;
}

/* Tons de cinza com fundo claro limpo: o preenchimento verde das tabelas e as linhas finas atrapalham o reconhecimento. */
function clean(canvas){
 const ctx=canvas.getContext('2d',{willReadFrequently:true}),img=ctx.getImageData(0,0,canvas.width,canvas.height),d=img.data;
 for(let i=0;i<d.length;i+=4){const g=.3*d[i]+.59*d[i+1]+.11*d[i+2],v=g>=175?255:g<=95?0:(g-95)*255/80;d[i]=d[i+1]=d[i+2]=v;}
 ctx.putImageData(img,0,0);return canvas;
}

async function read(worker,canvas,psm){
 await worker.setParameters({tessedit_pageseg_mode:String(psm),preserve_interword_spaces:'1',user_defined_dpi:'300'});
 const {data}=await worker.recognize(canvas,{},{blocks:true,text:false});return wordsOf(data);
}

async function fastPass(worker,page){
 let canvas=await render(page,FAST,0),rotation=looksSideways(canvas)?90:0;
 if(rotation)canvas=await render(page,FAST,rotation);
 let words=await read(worker,clean(canvas),6),best=quality(words);
 if(best<400)for(const alt of [0,90,270].filter(r=>r!==rotation)){
  const c=await render(page,FAST,alt),w=await read(worker,clean(c),6),q=quality(w);
  if(q>best){best=q;words=w;rotation=alt;canvas=c;}
  if(best>=400)break;}
 return {words,rotation,height:canvas.height};
}

const monthly=lines=>lines.some(l=>(norm(l.text).match(/\bm\S{1,3} ?\d{1,2}\b/g)||[]).length>=4);

const memory=new Map();
/* Lê as páginas indicadas e devolve {índice: linhas}. O resultado fica em memória até recarregar a página. */
export async function ocrPages(file,buffer,indices,onProgress=()=>{}){
 const key=[file.name,file.size,file.lastModified].join('|');if(memory.has(key))return memory.get(key);
 const [{default:Tesseract},lib]=await Promise.all([import('./vendor/tesseract.esm.min.js'),import('./vendor/pdf.min.mjs')]);
 lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
 const doc=await lib.getDocument({data:new Uint8Array(buffer).slice(),isEvalSupported:false,enableXfa:false,verbosity:0}).promise;
 const size=Math.min(4,Math.max(1,(navigator.hardwareConcurrency||2)-1)),workers=[];
 try{
  onProgress('Preparando o OCR local…');
  for(let i=0;i<size;i++)workers.push(await Tesseract.createWorker('por',1,{workerPath:BASE+'worker.min.js',corePath:BASE+'tesseract-core-simd-lstm.wasm.js',langPath:BASE.replace(/\/$/,''),gzip:true,cacheMethod:'none',workerBlobURL:false}));
  const lines={},rotations={};
  const run=async(list,job)=>{let next=0,done=0;await Promise.all(workers.map(async w=>{while(next<list.length){const i=list[next++];await job(w,i);done++;onProgress(done,list.length);}}));};
  await run(indices,async(w,i)=>{const page=await doc.getPage(i+1),r=await fastPass(w,page);rotations[i]=r.rotation;lines[i]=wordsToLines(r.words,FAST,r.height);page.cleanup();});
  const tables=indices.filter(i=>monthly(lines[i]));
  onProgress('Relendo os quadros mensais em alta resolução…');
  await run(tables,async(w,i)=>{const page=await doc.getPage(i+1),canvas=clean(await render(page,FINE,rotations[i])),words=await read(w,canvas,6);lines[i]=wordsToLines(words,FINE,canvas.height);page.cleanup();});
  const result={lines,tables,rotations,pages:indices.length};memory.set(key,result);return result;
 }finally{await Promise.allSettled(workers.map(w=>w.terminate()));await doc.destroy();}
}
