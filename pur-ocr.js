/* OCR local para PUR digitalizado. Tudo roda no navegador, com arquivos de vendor/; o documento não sai da máquina.
 * Fluxo: passada rápida em todas as páginas sem texto para achar orientação, marcadores e quadros mensais;
 * depois releitura em alta resolução só das páginas com quadro mensal. */
const BASE=new URL('./vendor/',import.meta.url).href,FAST=3,FINE=5;
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

/* Índices das páginas sem texto útil. Linhas repetidas na maioria das páginas (carimbo de assinatura) não contam. */
export function textlessPages(pages,minChars=40){
 const count=new Map();
 for(const lines of pages)for(const t of new Set(lines.map(l=>l.text)))count.set(t,(count.get(t)||0)+1);
 // Com duas páginas, uma linha nas duas já é carimbo. Numa página só, vale o texto típico do carimbo.
 const limit=Math.max(2,pages.length*.5),stamp=t=>count.get(t)>=limit||/assinad[oa]\s+(digital|eletronic)|verificar\s+(as\s+)?assinaturas|codigo\s+(de\s+)?verificacao/i.test(norm(t));
 return pages.flatMap((lines,i)=>lines.filter(l=>!stamp(l.text)).map(l=>l.text).join('').replace(/\s/g,'').length<minChars?[i]:[]);
}

/* Corrige um número lido por OCR. Valores com centavos têm sempre dois dígitos no fim; o separador pode vir trocado ou sumir. */
export function repairNumber(text){
 let t=String(text).replace(/[|[\]{}!]/g,'').trim();
 if(/^[-–—~_=.:;]{1,3}$/.test(t))return '-';
 if(/^\d{1,2}\/\d{2,4}$/.test(t)||!/^[-–—~_.,:;\s]*\d[\d.,/OoIlSB\s]*[-–—~_.,:;]*$/.test(t))return t;
 t=t.replace(/^[-–—~_.,:;\s]+/,'').replace(/[-–—~_.,:;\s]+$/,'').replace(/([.,])\//g,'$17').replace(/\/([.,])/g,'7$1').replace(/\/(\d{2})$/,',$1').replace(/\//g,'7');
 const fixed=t.replace(/[Oo]/g,'0').replace(/[Il]/g,'1').replace(/S/g,'5').replace(/B/g,'8').replace(/\s/g,'');
 if(!/[.,]\d{2}$/.test(fixed)&&!/^\d{6,}$/.test(fixed))return fixed;
 const d=fixed.replace(/\D/g,'');return d.slice(0,-2)+','+d.slice(-2);
}

const distance=(a,b)=>{if(a===b)return 0;if(a.length<b.length)[a,b]=[b,a];if(a.length-b.length>1)return 2;let i=0;while(i<b.length&&a[i]===b[i])i++;return a.length===b.length?(a.slice(i+1)===b.slice(i+1)?1:2):(a.slice(i+1)===b.slice(i)?1:2);};
const cents=v=>v.toFixed(2).replace('.','');
/* Compara a soma de uma rubrica com o total do quadro. Cada célula pode diferir meio centavo do valor real, por arredondamento na origem.
 * Se trocar ou remover um dígito de um único valor fecha a soma, ele é corrigido. */
export function reconcile(values,total){
 const tol=.005*values.filter(Boolean).length+.005,sum=values.reduce((s,v)=>s+(v||0),0),diff=sum-total;
 if(Math.abs(diff)<=tol)return {ok:true,sum};
 const hits=[];
 values.forEach((v,m)=>{if(!v)return;const s=cents(v),tried=new Set([s]);
  for(let i=0;i<s.length;i++)for(const t of [s.slice(0,i)+s.slice(i+1),...[...'0123456789'].map(d=>s.slice(0,i)+d+s.slice(i+1))]){
   if(tried.has(t))continue;tried.add(t);const want=+t/100,left=Math.abs(diff-v+want);if(left<=tol)hits.push({m,want,left});}});
 if(new Set(hits.map(h=>h.m)).size===1)return {ok:true,sum,fixed:hits.sort((a,b)=>a.left-b.left)[0]};
 if(!hits.length&&distance(cents(sum),cents(total))<=1)return {ok:true,sum,totalMisread:true};
 return {ok:false,sum};
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
 // Última coluna perdida: a distância até o cabeçalho seguinte (Total) mostra quantos meses faltam.
 const end=found[found.length-1],next=rest.find(c=>c.x0>end.x1);
 if(next)for(let r=1,extra=Math.min(3,Math.round(((next.x0+next.x1)-(end.x0+end.x1))/2/step)-1);r<=extra;r++)out.push({x0:end.x0+step*r,x1:end.x1+step*r,n:offset+end.rank+r});
 const heads=out.map(c=>({x0:c.x0,x1:c.x1,xc:(c.x0+c.x1)/2,text:'Mês '+String(c.n).padStart(2,'0')}));
 const all=[...rest,...heads].sort((a,b)=>a.x0-b.x0);
 return {...line,cells:all,text:all.map(c=>c.text).join(' ')};
}

const numeric=t=>t==='-'||/^[\d.,]*\d[\d.,]*$/.test(t);
/* Agrupa palavras em linhas e células. Números vizinhos nunca se juntam, porque as colunas mensais ficam muito próximas. */
function linesOf(items){
 const lines=[];
 // Agrupa pelo centro vertical: a base de um traço fica acima da base dos dígitos, e uma linha de traços separava os números.
 const mid=it=>it.y+it.h/2;
 for(const it of [...items].sort((a,b)=>mid(b)-mid(a)||a.x-b.x)){const tol=Math.max(2,it.h*.45);let line=lines.find(l=>Math.abs(l.c-mid(it))<=tol);if(!line){line={c:mid(it),y:it.y,items:[]};lines.push(line);}line.items.push(it);line.y=Math.min(line.y,it.y);}
 lines.sort((a,b)=>b.c-a.c);
 return lines.map(l=>{
  const cells=[];
  for(const it of l.items.sort((a,b)=>a.x-b.x)){const last=cells[cells.length-1],gap=last?it.x-last.x1:Infinity;
   const fragment=last&&/^\d{1,3}$/.test(last.text)&&/^\d{3}/.test(it.text);
   if(last&&gap<Math.max(2,it.h*.7)&&(fragment||(!numeric(it.text)&&!numeric(last.text)))){last.text+=(fragment?'':' ')+it.text;last.x1=Math.max(last.x1,it.x+it.w);}
   else cells.push({x0:it.x,x1:it.x+it.w,text:it.text});}
  for(const c of cells)c.xc=(c.x0+c.x1)/2;
  // Altura típica da linha sem os traços, que são baixos e encolhiam o recorte de fillGaps.
  const tall=l.items.filter(i=>i.text.length>1),hs=(tall.length?tall:l.items).map(i=>i.h).sort((a,b)=>a-b);
  return {y:l.y,h:hs[Math.floor(hs.length/2)],cells,text:cells.map(c=>c.text).join(' ')};
 });
}

/* Converte palavras do OCR em linhas no mesmo formato do leitor de PDF. Coordenadas em pontos, com y crescendo para cima. */
export function wordsToLines(words,scale,height){
 const items=words.map(w=>({text:repairNumber(w.text.replace(/[|[\]{}]/g,'')),x:w.x0/scale,y:(height-w.y1)/scale,w:(w.x1-w.x0)/scale,h:Math.max(1,(w.y1-w.y0)/scale)})).filter(i=>i.text.trim());
 return linesOf(items).map(line=>{
  // Sobra de linha de grade vira traço colado no número seguinte.
  const cells=line.cells.map(c=>({...c,text:repairNumber(c.text)})).filter((c,i,all)=>c.text&&!(c.text==='-'&&all[i+1]&&numeric(all[i+1].text)&&all[i+1].text!=='-'&&all[i+1].x0-c.x1<(c.x1-c.x0+6)));
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

/* Inclinação da digitalização, em radianos: o ângulo em que a tinta se concentra em menos linhas.
 * Num quadro largo, 1 grau já faz uma linha invadir a de baixo. */
export function skewAngle(canvas){
 const k=4,w=Math.floor(canvas.width/k),h=Math.floor(canvas.height/k);if(w<50||h<50)return 0;
 const small=document.createElement('canvas');small.width=w;small.height=h;
 const ctx=small.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,w,h);const px=ctx.getImageData(0,0,w,h).data;
 const hist=new Uint32Array(256);for(let i=0;i<w*h;i++)hist[px[i*4+1]]++;
 let n=0,bg=255;for(let g=0;g<256;g++){n+=hist[g];if(n>=w*h/2){bg=g;break;}}
 let xs=[],ys=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(px[(y*w+x)*4+1]<bg-40){xs.push(x);ys.push(y);}
 if(xs.length<200)return 0;
 const every=Math.ceil(xs.length/30000);if(every>1){xs=xs.filter((_,i)=>i%every===0);ys=ys.filter((_,i)=>i%every===0);}
 const off=w*.06+2,bins=new Int32Array(h+2*Math.ceil(off)+2);
 const score=a=>{const t=Math.tan(a);bins.fill(0);for(let i=0;i<xs.length;i++)bins[Math.round(ys[i]+xs[i]*t+off)]++;let s=0;for(const v of bins)s+=v*v;return s;};
 // Busca grossa de meio em meio grau, depois refinada de 0,1 em 0,1 em volta do melhor.
 const flat=score(0),deg=Math.PI/180;let best=0,top=flat;
 for(let d=-3;d<=3.001;d+=.5){const v=score(d*deg);if(v>top){top=v;best=d;}}
 for(let d=best-.4;d<=best+.401;d+=.1){const v=score(d*deg);if(v>top){top=v;best=d;}}
 best*=deg;
 return Math.abs(best)>=.25*Math.PI/180&&top>flat*1.1?best:0;
}
function deskew(canvas){
 const a=skewAngle(canvas);if(!a)return canvas;
 const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;
 const ctx=out.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);
 ctx.translate(out.width/2,out.height/2);ctx.rotate(a);ctx.drawImage(canvas,-canvas.width/2,-canvas.height/2);return out;
}

async function render(page,scale,rotation){
 const viewport=page.getViewport({scale,rotation:(page.rotate+rotation)%360}),canvas=document.createElement('canvas');
 canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillText=()=>{}; // O único texto real destas páginas é o carimbo de assinatura, que costuma passar por cima dos quadros.
 await page.render({canvasContext:ctx,viewport,intent:'print'}).promise; // 'print' não depende de animação: a leitura segue com a janela em segundo plano.
 return deskew(canvas);
}

/* Tons de cinza, fundo limpo e sem as linhas de grade, que o OCR confunde com letras e que escondem o cabeçalho dos quadros. */
export function clean(canvas,scale){
 const ctx=canvas.getContext('2d',{willReadFrequently:true}),W=canvas.width,H=canvas.height,img=ctx.getImageData(0,0,W,H),d=img.data,dark=new Uint8Array(W*H),kill=new Uint8Array(W*H),L=Math.round(14*scale);
 // Digitalização com pouco contraste: a tinta mais escura vira preto e o fundo (mediana) vira branco antes dos limiares.
 const gray=new Float32Array(W*H),hist=new Uint32Array(256);
 for(let i=0;i<W*H;i++){const g=.3*d[i*4]+.59*d[i*4+1]+.11*d[i*4+2];gray[i]=g;hist[g|0]++;}
 const at=(q,top=256)=>{let all=0;for(let k=0;k<top;k++)all+=hist[k];let n=0;for(let k=0;k<top;k++){n+=hist[k];if(n>=all*q)return k;}return top-1;};
 // Fundo: mediana da página. Tinta: 5% mais escuros entre os pixels bem mais escuros que o fundo.
 const hi=at(.5),ink=hist.slice(0,Math.max(0,hi-40)).reduce((a,b)=>a+b,0),lo=ink>=W*H*.0005?at(.05,hi-40):0,span=(lo>70||hi<215)&&hi-lo>=40?255/(hi-lo):0;
 for(let i=0;i<W*H;i++){const g=span?Math.min(255,Math.max(0,(gray[i]-lo)*span)):gray[i],v=g>=175?255:g<=95?0:(g-95)*255/80;d[i*4]=d[i*4+1]=d[i*4+2]=v;dark[i]=v<190?1:0;}
 for(let y=0;y<H;y++){let s=-1;for(let x=0;x<=W;x++){const on=x<W&&dark[y*W+x];if(on&&s<0)s=x;if(!on&&s>=0){if(x-s>=L)for(let k=s;k<x;k++)kill[y*W+k]=1;s=-1;}}}
 for(let x=0;x<W;x++){let s=-1;for(let y=0;y<=H;y++){const on=y<H&&dark[y*W+x];if(on&&s<0)s=y;if(!on&&s>=0){if(y-s>=L)for(let k=s;k<y;k++)kill[k*W+x]=1;s=-1;}}}
 for(let i=0;i<W*H;i++)if(kill[i])d[i*4]=d[i*4+1]=d[i*4+2]=255;
 ctx.putImageData(img,0,0);return canvas;
}

async function read(worker,canvas,psm){
 await worker.setParameters({tessedit_pageseg_mode:String(psm),preserve_interword_spaces:'1',user_defined_dpi:'300'});
 const {data}=await worker.recognize(canvas,{},{blocks:true,text:false});return wordsOf(data);
}

async function fastPass(worker,page){
 let canvas=await render(page,FAST,0),rotation=looksSideways(canvas)?90:0;
 if(rotation)canvas=await render(page,FAST,rotation);
 let words=await read(worker,clean(canvas,FAST),6),best=quality(words);
 if(best<400)for(const alt of [0,90,270].filter(r=>r!==rotation)){
  const c=await render(page,FAST,alt),w=await read(worker,clean(c,FAST),6),q=quality(w);
  if(q>best){best=q;words=w;rotation=alt;canvas=c;}
  if(best>=400)break;}
 return {words,rotation,height:canvas.height};
}

/* Colunas de valores alinhados à direita: bordas direitas que se repetem em várias linhas. */
export function valueColumns(rows){
 const edges=rows.flatMap(l=>l.cells.filter(c=>numeric(c.text)).map(c=>c.x1)).sort((a,b)=>a-b),groups=[];
 for(const x of edges){const g=groups[groups.length-1];if(g&&x-g[g.length-1]<=3)g.push(x);else groups.push([x]);}
 return groups.filter(g=>g.length>=3).map(g=>g[Math.floor(g.length/2)]);
}

/* O OCR às vezes perde um valor isolado da linha. Cada célula vazia é relida sozinha, aceitando só números.
 * O recorte é ampliado até os dígitos ficarem com uns 32 px de altura: letra grande demais também atrapalha o Tesseract.
 * Sem leitura confiável, tenta uma segunda ampliação, que só vale para valor completo com centavos. */
export async function fillGaps(worker,canvas,lines,scale){
 const rows=lines.filter(l=>l.cells.filter(c=>numeric(c.text)).length>=6);if(rows.length<3)return;
 const columns=valueColumns(rows);if(columns.length<6)return;
 const step=columns.slice(1).map((x,i)=>x-columns[i]).sort((a,b)=>a-b)[Math.floor((columns.length-1)/2)];
 await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789.,-'});
 const H=canvas.height;
 for(const row of rows)for(let i=0;i<columns.length;i++){const right=columns[i];
  if(row.cells.some(c=>Math.abs(c.x1-right)<=4))continue;
  const left=i?columns[i-1]+1:right-Math.min(step,60),x=Math.floor(left*scale),w=Math.ceil((right+2)*scale)-x,bottom=H-row.y*scale,h=Math.ceil(row.h*scale*1.8),y=Math.floor(bottom-row.h*scale*1.4);
  const zoom=Math.min(3,Math.max(1,32/(row.h*scale)));
  for(const [n,k] of [zoom,zoom>1.5?zoom/2:zoom*2].entries()){
   const crop=document.createElement('canvas');crop.width=Math.ceil(w*k)+40;crop.height=Math.ceil(h*k)+40;
   const ctx=crop.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,crop.width,crop.height);ctx.imageSmoothingQuality='high';ctx.drawImage(canvas,x,y,w,h,20,20,w*k,h*k);
   const {data}=await worker.recognize(crop,{},{blocks:true}),text=repairNumber(wordsOf(data).map(k=>k.text).join(''));
   if(n?/\d,\d{2}$/.test(text):numeric(text)){row.cells.push({x0:right-text.length*row.h*.45,x1:right,xc:right,text});break;}}
 }
 for(const row of rows){row.cells.sort((a,b)=>a.x0-b.x0);row.text=row.cells.map(c=>c.text).join(' ');}
 await worker.setParameters({tessedit_char_whitelist:''});
}

/* A leitura em bloco único (psm 6) às vezes ignora títulos soltos acima do quadro, como "De:" e "Para:".
 * Uma leitura esparsa da mesma página devolve essas linhas; entram só as curtas, sem números e em altura ainda vazia. */
export function addTitles(lines,sparse){
 const free=s=>!lines.some(l=>Math.abs(l.y-s.y)<=Math.max(l.h||0,s.h||0)*.8);
 const extra=sparse.filter(s=>s.text.length<=40&&/\p{L}{2}/u.test(s.text)&&!s.cells.some(c=>numeric(c.text))&&free(s));
 return extra.length?[...lines,...extra].sort((a,b)=>b.y-a.y):lines;
}

/* Quadro mensal: cabeçalho com meses, título de cronograma ou linha com muitos valores. A passada rápida nem sempre lê o cabeçalho. */
const monthly=lines=>lines.some(l=>(l.text.length<40&&/cronograma/.test(norm(l.text)))||(norm(l.text).match(/\bm\S{1,3} ?\d{1,2}\b/g)||[]).length>=4||l.cells.filter(c=>/\d,\d{2}$/.test(c.text)).length>=8);

const memory=new Map();
/* Lê as páginas indicadas e devolve {índice: linhas}. O resultado fica em memória até recarregar a página. */
export async function ocrPages(file,buffer,indices,onProgress=()=>{}){
 const key=[file.name,file.size,file.lastModified].join('|');if(memory.has(key))return memory.get(key);
 const [{default:Tesseract},lib]=await Promise.all([import('./vendor/tesseract.esm.min.js'),import('./vendor/pdf.min.mjs')]);
 lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
 const doc=await lib.getDocument({data:new Uint8Array(buffer).slice(),isEvalSupported:false,enableXfa:false,verbosity:0}).promise;
 const size=Math.min(6,Math.max(1,(navigator.hardwareConcurrency||2)-1)),workers=[];
 try{
  onProgress('Preparando o OCR local…');
  for(let i=0;i<size;i++)workers.push(await Tesseract.createWorker('por',1,{workerPath:BASE+'worker.min.js',corePath:BASE+'tesseract-core-simd-lstm.wasm.js',langPath:BASE.replace(/\/$/,''),gzip:true,cacheMethod:'none',workerBlobURL:false}));
  const lines={},rotations={};
  const run=async(list,job)=>{let next=0,done=0;await Promise.all(workers.map(async w=>{while(next<list.length){const i=list[next++];await job(w,i);done++;onProgress(done,list.length);}}));};
  await run(indices,async(w,i)=>{const page=await doc.getPage(i+1),r=await fastPass(w,page);rotations[i]=r.rotation;lines[i]=wordsToLines(r.words,FAST,r.height);page.cleanup();});
  const tables=indices.filter(i=>monthly(lines[i]));
  onProgress('Relendo os quadros mensais em alta resolução…');
  await run(tables,async(w,i)=>{const page=await doc.getPage(i+1),canvas=clean(await render(page,FINE,rotations[i]),FINE),words=await read(w,canvas,6);lines[i]=wordsToLines(words,FINE,canvas.height);await fillGaps(w,canvas,lines[i],FINE);
   const small=clean(await render(page,FAST,rotations[i]),FAST);lines[i]=addTitles(lines[i],wordsToLines(await read(w,small,11),FAST,small.height));page.cleanup();});
  const result={lines,tables,rotations,pages:indices.length};memory.set(key,result);return result;
 }finally{await Promise.allSettled(workers.map(w=>w.terminate()));await doc.destroy();}
}
