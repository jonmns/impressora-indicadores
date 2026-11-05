/* Leitura conservadora de adendos: prioriza exclusivamente os trechos PARA.
 * Depende do leitor já existente do projeto e não altera o tratamento do financeiro. */
import {pdfPages,parsePur,linesFromItems} from './pur-pdf.js';
import {durationFromText,categories,rubrica} from './engine.js';
import {textlessPages,ocrPages,reconcile} from './pur-ocr.js';

const brl=n=>n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const marker=s=>{
 const t=normalize(s).replace(/[\s:;.,\-–—]+$/,'');
 // Sem dois-pontos e fora de maiúsculas, a linha precisa começar com maiúscula ("De", "Para", "Situação anterior"),
 // e "Quadro de" não vale: no texto corrido, uma linha quebrada pode ser só "de", "Quadro de" ou "anterior.". O OCR às vezes perde os dois-pontos.
 const raw=String(s||'').trim();if(!raw.includes(':')&&raw!==raw.toUpperCase()&&(!/^\p{Lu}/u.test(raw)||/ de$/.test(t)))return null;
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
 let hasPara=all.includes('PARA'),hasDe=all.includes('DE');
 // Só DE, sem PARA: se nenhum DE vem antes de um quadro de meses com rubricas, é fragmento de texto (comum no OCR) e não marcador.
 if(hasDe&&!hasPara){const flat=pages.flat(),months=l=>[l.text,...l.cells.map(c=>c.text)].flatMap(monthTokens).length>=4;
  const money=j=>months(flat[j])&&flat.slice(j+1,j+40).some(l=>rubrica(l.text));
  const real=flat.some((l,i)=>marker(l.text)==='DE'&&flat.slice(i+1,i+80).some((_,k)=>money(i+1+k)));
  if(!real)return {pages,hasPara:false,hasDe:false,filtered:false,ignored:true};}
 if(!adendo||(!hasDe&&!hasPara))return {pages,hasPara,hasDe,filtered:false};
 let current=null,seenPara=false;
 const filtered=pages.map(lines=>lines.map(line=>{
  const m=marker(line.text);
  if(m){current=m;if(m==='PARA')seenPara=true;return {...line,cells:[],text:''};}
  return current==='PARA'?line:{...line,cells:[],text:''};
 }));
 return {pages:filtered,hasPara,hasDe,filtered:seenPara};
}
/* Confere cada mês contra a linha Sub-Total do quadro: soma das sete rubricas do relatório mais as demais (livros, viagens, treinamento).
 * Divergência vira aviso; nenhum valor é alterado. Devolve {checked, ok, bad}. Função pura, testável sem PDF. */
export function checkSubtotals(result,ocr=false){
 const subs=result.subtotals||[],bad=[],open=[];let checked=0;
 for(let m=0;m<Math.min(subs.length,result.duration||subs.length);m++){const want=subs[m];if(want===null||want===undefined)continue;
  const parts=[...categories.map(c=>result.values[c]?.[2]?.[m]??null),...Object.values(result.others||{}).map(a=>a[m]??null)];
  if(categories.some(c=>(result.values[c]?.[2]?.[m]??null)===null)){open.push(m+1);continue;}
  checked++;const sum=parts.reduce((s,v)=>s+(v||0),0),tol=.005*parts.filter(Boolean).length+.005;
  if(Math.abs(sum-want)>tol)bad.push({m,sum,want,missing:parts.some(v=>v===null)});}
 const tag=ocr?'OCR: ':'';
 if(bad.length)result.notices.unshift(`${tag}a soma das rubricas difere da linha Sub-Total do quadro em ${bad.length===1?'1 mês':bad.length+' meses'}: ${bad.map(b=>`mês ${b.m+1} (soma ${brl(b.sum)}, Sub-Total ${brl(b.want)}${b.missing?', há rubrica fora do relatório sem leitura':''})`).join('; ')}. Nenhum valor foi alterado; confira esses meses no PDF.`);
 if(open.length)result.notices.push(`Sub-Total do quadro não conferido ${open.length===1?'no mês':'nos meses'} ${open.join(', ')}, porque há rubrica pendente.`);
 return {checked,ok:checked-bad.length,bad:bad.length};
}

/* Termo Aditivo sem DE/PARA só vale como plano vigente se o quadro fechar: toda rubrica lida tem total e a soma dos meses bate,
 * e o Sub-Total confere em pelo menos um mês, sem nenhum mês divergente. Tolerância de meio centavo por célula. */
export function consolidatedOk(result,subs){return !consolidatedProblem(result,subs);}
/* Motivo para não aceitar o Termo Aditivo como plano, ou '' quando fecha. */
export function consolidatedProblem(result,subs){
 const cats=Object.keys(result.values).filter(c=>result.values[c][2].some(v=>v!==null));
 if(!cats.length)return 'nenhuma rubrica lida no quadro financeiro';
 for(const c of cats){const a=result.values[c][2],t=result.totals[c];
  if(t===undefined||t===null)return `sem total lido para ${c}`;
  if(a.some(v=>v===null))return `${c} com meses sem leitura`;
  const sum=a.reduce((s,v)=>s+v,0);if(Math.abs(sum-t)>.005*a.filter(Boolean).length+.005)return `${c}: soma dos meses ${brl(sum)} diferente do total ${brl(t)}`;}
 if(!subs.checked)return 'Sub-Total do quadro não conferido em nenhum mês';
 if(subs.bad)return `Sub-Total diverge em ${subs.bad} ${subs.bad===1?'mês':'meses'}`;
 return '';
}

/* Confere os valores lidos por OCR com os totais do próprio quadro. Função pura, testável sem PDF. */
export function reviewOcr(result,name,pages){
 const rows=Object.entries(result.totals).map(([cat,total])=>({cat,total,...reconcile(result.values[cat][2],total)}));
 for(const r of rows.filter(r=>r.fixed)){const {m,want}=r.fixed,old=result.values[r.cat][2][m];result.values[r.cat][2][m]=want;result.sources[r.cat][2][m]+=`, valor lido ${old} corrigido pela soma da linha`;result.notices.unshift(`OCR: ${r.cat}, mês ${m+1}: valor lido ${old} corrigido para ${want} para fechar com o total do quadro. Confira.`);}
 // Traço de célula vazia pode sumir no OCR. Se a soma dos valores lidos já bate com o total, as células sem leitura valem zero.
 const zeroed=[];
 for(const r of rows.filter(r=>r.ok)){const months=[];result.values[r.cat][2].forEach((v,m,a)=>{if(v===null){a[m]=0;months.push(m+1);result.sources[r.cat][2][m]=`${name}: célula sem valor, soma da linha confere com o total`;}});if(months.length)zeroed.push({cat:r.cat,months});}
 if(zeroed.length){const n=zeroed.reduce((s,z)=>s+z.months.length,0);result.notices.unshift(`OCR: ${n} ${n===1?'célula ficou':'células ficaram'} sem leitura e ${n===1?'foi considerada':'foram consideradas'} zero porque a soma da rubrica confere com o total do quadro: ${zeroed.map(z=>`${z.cat} (${z.months.length===1?'mês':'meses'} ${z.months.join(', ')})`).join('; ')}. Confira no PDF se essas células estão mesmo vazias.`);}
 // A soma só fecha com o total trocando um dígito do próprio total: os meses ficam como lidos, mas o total do PDF precisa ser conferido.
 for(const r of rows.filter(r=>r.totalMisread))result.notices.unshift(`OCR: em ${r.cat} a soma dos meses (${brl(r.sum)}) só fecha com o total do quadro (${brl(r.total)}) se um dígito do total tiver sido lido errado. Os valores mensais foram mantidos; confira o total dessa rubrica no PDF.`);
 for(const r of rows.filter(r=>!r.ok))result.notices.unshift(`OCR: em ${r.cat} a soma dos meses (${r.sum.toFixed(2)}) difere do total do quadro (${r.total.toFixed(2)}). Confira essa rubrica no PDF.`);
 // Rubricas fora do relatório (livros, viagens, treinamento) só servem para conferir o Sub-Total do mês.
 for(const [o,total] of Object.entries(result.otherTotals||{})){const a=result.others?.[o];if(!a)continue;const r=reconcile(a,total);
  if(r.fixed){const old=a[r.fixed.m];a[r.fixed.m]=r.fixed.want;result.notices.unshift(`OCR: ${o} (rubrica fora do relatório), mês ${r.fixed.m+1}: valor lido ${old} tratado como ${r.fixed.want} para fechar com o total do quadro, só na conferência do Sub-Total.`);}
  if(r.ok)a.forEach((v,m)=>{if(v===null)a[m]=0;});
  else result.notices.unshift(`OCR: em ${o} (rubrica fora do relatório) a soma dos meses (${brl(r.sum)}) difere do total do quadro (${brl(total)}). A conferência dos meses pelo Sub-Total pode acusar diferença por isso.`);}
 const ok=rows.filter(r=>r.ok).length;
 result.notices.unshift(`PDF digitalizado: valores lidos por OCR em ${pages} páginas. ${rows.length?`${ok} de ${rows.length} rubricas conferem com o total do quadro. `:''}Confira cada valor com o PDF antes de gerar o relatório.`);
 for(const cat of Object.keys(result.sources))for(const row of Object.keys(result.sources[cat]))result.sources[cat][row]=result.sources[cat][row].map(s=>s&&`${s} (OCR)`);
}
export async function readPurPdf(file,options={}){
 const buffer=await file.arrayBuffer();
 let pages=await pdfPages(buffer);
 if(!durationFromHeaders(pages)){
  const rotated=await rotatedPages(buffer);
  if(durationFromHeaders(rotated))pages=pages.map((original,i)=>[...original,...rotated[i]]);
 }
 let ocr=null;
 // Cabeçalho de meses no texto não basta: o cronograma físico pode ter texto e o quadro financeiro ser imagem.
 if(!durationFromHeaders(pages)||!parsePur(pages,{start:options.start,file:file.name}).moneyMonths){
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
 // Termo Aditivo sem nenhum quadro DE/PARA: pode trazer o plano completo. Só é aceito se o quadro fechar (ver consolidatedOk).
 const consolidated=adendo&&!selected.hasDe&&!selected.hasPara;
 const noPara=()=>Error('Este documento parece ser um adendo, mas não identifiquei claramente o quadro PARA. Para evitar valores desatualizados, use um PDF com texto selecionável e estrutura DE/PARA legível.');
 if(adendo&&!selected.hasPara&&!consolidated)throw noPara();
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
  for(const a of [result.subtotals,...Object.values(result.others)]){while(a.length<chosen)a.push(null);a.length=chosen;}
 }
 if(ocr)reviewOcr(result,file.name,ocr.pages);
 const subs=checkSubtotals(result,!!ocr);
 if(ocr&&subs.checked)result.notices.unshift(`OCR: Sub-Total do quadro confere em ${subs.ok} de ${subs.checked} meses.`);
 if(consolidated){const why=consolidatedProblem(result,subs);if(why)throw Error(`Termo Aditivo sem quadros DE/PARA: o quadro financeiro não fecha (${why}), então não é seguro lê-lo como plano completo. Confira o PDF.`);result.notices.unshift('Plano lido de Termo Aditivo sem DE/PARA: confira com o documento. As rubricas fecham com os totais do quadro e com o Sub-Total.');}
 if(selected.filtered)result.notices.unshift('Adendo: leitura limitada aos trechos identificados como PARA. Confira se as demais rubricas não alteradas estão completas; um adendo parcial pode exigir o PUR consolidado.');
 if(adendo&&!selected.hasDe)result.notices.unshift('Adendo: foi encontrado PARA sem DE. Verifique a integridade do documento.');
 result.text=full;
 result.adendo={detected:adendo,usedPara:selected.filtered,hasDe:selected.hasDe,hasPara:selected.hasPara,headerMonths:byHeader};
 return result;
}
