/* Leitura conservadora de adendos: prioriza exclusivamente os trechos PARA.
 * Depende do leitor já existente do projeto e não altera o tratamento do financeiro. */
import {pdfPages,parsePur,linesFromItems} from './pur-pdf.js';
import {durationFromText} from './engine.js';
import {textlessPages,ocrPages,reconcile} from './pur-ocr.js';
import {rhTotals} from './pur-rh.js';

const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const marker=s=>{
 const t=normalize(s).replace(/[\s:;.,\-–—]+$/,'');
 if(/^(?:situacao|redacao|quadro|versao)?\s*(?:anterior|de)$/.test(t))return 'DE';
 if(/^(?:situacao|redacao|quadro|versao)?\s*(?:proposta|atualizada|nova|para)$/.test(t))return 'PARA';
 if(/^(?:onde se le|onde esta escrito)$/.test(t))return 'DE';
 if(/^(?:leia-se|passa a vigorar)$/.test(t))return 'PARA';
 return null;
};
const monthTokens=s=>{
 const nums=[];
 const re=/\b(?:m[eê]s|mes)\s*(?:n[º°.]\s*)?0?([1-9]|1\d|2[0-4])\b/gi;
 for(const m of String(s||'').matchAll(re))nums.push(+m[1]);
 return nums;
};
function durationFromHeaders(pages){
 let max=0;for(const page of pages)for(const line of page){
  const candidates=[line.text,...line.cells.map(c=>c.text)];
  const numbers=candidates.flatMap(monthTokens);
  if(numbers.length>=2 || (numbers.length===1&&/\bmes\b/i.test(line.text)))max=Math.max(max,...numbers);
 }
 return max||null;
}
async function rotatedPages(buffer){
 const pdfjs=await import('./vendor/pdf.min.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
 const doc=await pdfjs.getDocument({data:new Uint8Array(buffer).slice(),isEvalSupported:false,enableXfa:false,verbosity:0}).promise;
 const pages=[];
 try{
  for(let n=1;n<=doc.numPages;n++){
   const pg=await doc.getPage(n),content=await pg.getTextContent();
   const vertical=content.items.filter(i=>i?.str?.trim()&&Math.abs(i.transform[1])>Math.abs(i.transform[0])*1.5);
   const items=vertical.map(i=>{
    const t=i.transform,positive=t[1]>=0;
    return {text:i.str,x:positive?t[5]:-t[5],y:positive?-t[4]:t[4],w:i.width||0,h:Math.abs(t[1])||i.height||8};
   });
   pages.push(linesFromItems(items));pg.cleanup();
  }
 }finally{await doc.destroy();}
 return pages;
}
function filterCurrent(pages,adendo){
 const all=pages.flatMap(p=>p.map(l=>marker(l.text))).filter(Boolean);
 const hasPara=all.includes('PARA'),hasDe=all.includes('DE');
 if(!adendo||(!hasDe&&!hasPara))return {pages,hasPara,hasDe,filtered:false};
 let current=null,seenPara=false;
 const filtered=pages.map(lines=>lines.map(line=>{
  const m=marker(line.text);
  if(m){current=m;if(m==='PARA')seenPara=true;return {...line,cells:[],text:''};}
  return current==='PARA'?line:{...line,cells:[],text:''};
 }));
 return {pages:filtered,hasPara,hasDe,filtered:seenPara};
}
export async function readPurPdf(file,options={}){
 const buffer=await file.arrayBuffer();
 let pages=await pdfPages(buffer);
 if(!durationFromHeaders(pages)){
  const rotated=await rotatedPages(buffer);
  if(durationFromHeaders(rotated))pages=pages.map((original,i)=>[...original,...rotated[i]]);
 }
 let ocr=null;
 if(!durationFromHeaders(pages)){
  const blank=textlessPages(pages);
  if(blank.length){
   ocr=await ocrPages(file,buffer,blank,(a,b)=>options.onProgress?.(b?`Lendo o PDF digitalizado (OCR): página ${a} de ${b}…`:a));
   pages=pages.map((lines,i)=>ocr.lines[i]||lines);
  }
 }
 const full=pages.flatMap(p=>p.map(l=>l.text)).join('\n');
 const adendo=/adendo|termo aditivo|apostilamento/i.test(file.name+' '+full.slice(0,12000));
 const selected=filterCurrent(pages,adendo);
 if(adendo&&selected.hasDe&&!selected.hasPara)throw Error('Adendo com quadro DE, mas sem quadro PARA identificável. Não é seguro extrair valores antigos. Confira o PDF.');
 if(adendo&&!selected.filtered && selected.hasPara)throw Error('Não foi possível isolar com segurança o quadro PARA do adendo. Confira a estrutura do PDF.');
 if(adendo&&!selected.hasPara)throw Error('Este documento parece ser um adendo, mas não identifiquei claramente o quadro PARA. Para evitar valores desatualizados, use um PDF com texto selecionável e estrutura DE/PARA legível.');
 const relevant=selected.filtered?selected.pages:pages;
 const result=parsePur(relevant,{start:options.start,duration:options.duration,file:file.name});
 const byHeader=durationFromHeaders(relevant);
 const byText=durationFromText(relevant.flatMap(p=>p.map(l=>l.text)).join('\n'));
 const found=[result.duration,byHeader,byText].filter(Number.isInteger);
 // O quadro financeiro define a duração. Cronograma físico e vigência podem ir além da execução.
 const chosen=result.moneyMonths||byHeader||byText||result.duration;
 if(result.moneyMonths&&byHeader>result.moneyMonths)result.notices.push(`O documento tem cronograma até o mês ${byHeader}, mas o quadro financeiro vai até o mês ${result.moneyMonths}. Foi usada a duração do quadro financeiro.`);
 if(chosen&&chosen>=1&&chosen<=24){
  if(result.duration&&result.duration!==chosen)result.notices.push(`O cronograma indica ${chosen} meses; a leitura anterior indicou ${result.duration}. Verifique a duração.`);
  result.duration=chosen;
  for(const cat of Object.keys(result.values))for(const row of Object.keys(result.values[cat])){
   const a=result.values[cat][row],s=result.sources[cat][row];
   if(a.length<chosen){while(a.length<chosen){a.push(null);s.push(null);}}else{a.length=chosen;s.length=chosen;}
  }
 }
 if(ocr){
  const rows=Object.entries(result.totals).map(([cat,total])=>({cat,total,...reconcile(result.values[cat][2],total)}));
  for(const r of rows.filter(r=>r.fixed)){const {m,want}=r.fixed,old=result.values[r.cat][2][m];result.values[r.cat][2][m]=want;result.sources[r.cat][2][m]+=`, valor lido ${old} corrigido pela soma da linha`;result.notices.unshift(`OCR: ${r.cat}, mês ${m+1}: valor lido ${old} corrigido para ${want} para fechar com o total do quadro. Confira.`);}
  // Traço de célula vazia pode sumir no OCR. Se a soma dos valores lidos já bate com o total, as células sem leitura valem zero.
  for(const r of rows.filter(r=>r.ok))result.values[r.cat][2].forEach((v,m,a)=>{if(v===null){a[m]=0;result.sources[r.cat][2][m]=`${file.name}: célula sem valor, soma da linha confere com o total`;}});
  for(const r of rows.filter(r=>!r.ok))result.notices.unshift(`OCR: em ${r.cat} a soma dos meses (${r.sum.toFixed(2)}) difere do total do quadro (${r.total.toFixed(2)}). Confira essa rubrica no PDF.`);
  const ok=rows.filter(r=>r.ok).length;
  result.notices.unshift(`PDF digitalizado: valores lidos por OCR em ${ocr.pages} páginas. ${rows.length?`${ok} de ${rows.length} rubricas conferem com o total do quadro. `:''}Confira cada valor com o PDF antes de gerar o relatório.`);
  for(const cat of Object.keys(result.sources))for(const row of Object.keys(result.sources[cat]))result.sources[cat][row]=result.sources[cat][row].map(s=>s&&`${s} (OCR)`);
 }
 if(selected.filtered)result.notices.unshift('Adendo: leitura limitada aos trechos identificados como PARA. Confira se as demais rubricas não alteradas estão completas; um adendo parcial pode exigir o PUR consolidado.');
 if(adendo&&!selected.hasDe)result.notices.unshift('Adendo: foi encontrado PARA sem DE. Verifique a integridade do documento.');
 const rh=rhTotals(pages,file.name);result.rhTotals=rh.totals;result.notices.push(...rh.notices);
 result.text=full;
 result.adendo={detected:adendo,usedPara:selected.filtered,hasDe:selected.hasDe,hasPara:selected.hasPara,headerMonths:byHeader};
 return result;
}
