/* OOXML adapter: never runs VBA, external links or formulas from uploaded files. */
export const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const categories=['Equipamentos','Laboratório','RHD','RHI','Materiais','STT','Correlatos'];
export const inputRows={2:'R$ PUR',3:'R$ realizado',10:'Profissionais PUR',11:'Profissionais realizados',15:'Horas PUR',16:'Horas realizadas'};
export const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const col=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const xml=s=>{const d=new DOMParser().parseFromString(s,'application/xml');if(d.querySelector('parsererror'))throw Error('Documento XML inválido.');return d;};
const tags=(d,n)=>Array.from(d.getElementsByTagNameNS('*',n));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const numeric=x=>typeof x==='number'&&Number.isFinite(x);
export function number(s){if(typeof s==='number')return s;if(!String(s).trim())return null;let t=String(s).trim().replace(/R\$|\s/g,'');if(t.includes(','))t=t.replace(/\./g,'').replace(',','.');if(!/^-?\d+(\.\d+)?$/.test(t))throw Error('Informe um número válido.');const n=Number(t);if(!Number.isFinite(n))throw Error('Número inválido.');return n;}
export function month(serial){if(typeof serial==='number'){const d=new Date(Date.UTC(1899,11,30)+serial*86400000);return d.getUTCFullYear()*12+d.getUTCMonth();}const t=String(serial??'');let m=t.match(/^(\d{4})-(\d{2})/);if(m)return +m[1]*12+(+m[2]-1);m=t.match(/^(\d{1,2})-(\d{4})$/);return m?+m[2]*12+(+m[1]-1):null;}
export function rubrica(label){const s=norm(label);if(s.includes('indireto')||s==='rhi')return 'RHI';if(s.includes('direto')||s==='rhd')return 'RHD';if(s.includes('correlato'))return 'Correlatos';if(s.includes('terceiro'))return 'STT';if(s.includes('materia')&&s.includes('consumo'))return 'Materiais';if(s.includes('laboratorio')||s.includes('infraestrutura'))return 'Laboratório';if(s.includes('programa')||s.includes('equipamento'))return 'Equipamentos';return null;}
export async function openWorkbook(data,kind='all'){
 const zip=await JSZip.loadAsync(data);let bytes=0;for(const e of Object.values(zip.files)){bytes+=e._data?.uncompressedSize||0;}if(bytes>100*1024*1024)throw Error('Arquivo descompactado maior que 100 MB.');
 const wb=xml(await zip.file('xl/workbook.xml')?.async('string')||'');
 if(tags(wb,'workbookPr')[0]?.getAttribute('date1904')==='1')throw Error('Este arquivo usa calendário 1904, ainda não suportado.');
 const rel=xml(await zip.file('xl/_rels/workbook.xml.rels').async('string'));
 const relations=Object.fromEntries(tags(rel,'Relationship').map(x=>[x.getAttribute('Id'),x.getAttribute('Target')]));
 let strings=[];if(zip.file('xl/sharedStrings.xml'))strings=tags(xml(await zip.file('xl/sharedStrings.xml').async('string')),'si').map(x=>tags(x,'t').map(t=>t.textContent).join(''));
 const sheets={};
 for(const node of tags(wb,'sheet')){
  const name=norm(node.getAttribute('name'));
  if(kind==='financial'&&!['posicao financeira','abertura'].some(x=>name.includes(x)))continue;
  if(kind==='plan'&&!['cronograma fisico','valores previstos','plano de trabalho'].some(x=>name.includes(x)))continue;
  const target=relations[node.getAttribute('r:id')];if(!target)continue;const path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
  const raw=await zip.file(path)?.async('string');if(!raw)continue;const doc=xml(raw),cells={};
  for(const c of tags(doc,'c')){const v=tags(c,'v')[0]?.textContent;const t=c.getAttribute('t');let value=null;if(t==='s')value=strings[Number(v)];else if(t==='inlineStr')value=tags(c,'t').map(t=>t.textContent).join('');else if(t==='str'||t==='e')value=v??null;else if(v!==undefined&&v!=='')value=Number(v);cells[c.getAttribute('r')]={value,formula:tags(c,'f')[0]?.textContent??null,type:t};}
  sheets[node.getAttribute('name')]={name:node.getAttribute('name'),path,doc,cells,get(a){return cells[a]?.value??null;},has(a){return !!cells[a];}};
 }
 return {zip,wb,sheets};
}
function set(data,cat,row,m,value,source){data.values[cat][row][m]=numeric(value)?value:null;data.sources[cat][row][m]=source;}
function findSheet(w,text){return Object.values(w.sheets).find(s=>norm(s.name).includes(text));}
function at(s,r,c){return s.get(col(c)+r);}
function rowsOf(s){return [...new Set(Object.keys(s.cells).map(a=>+a.match(/\d+/)[0]))].sort((a,b)=>a-b);}
function monthsHeader(s){for(const r of rowsOf(s).slice(0,20)){const map={};for(let c=1;c<=60;c++){const m=norm(at(s,r,c)).match(/^(?:mes\s*|m)(\d{1,2})$/);if(m)map[+m[1]-1]=c;}if(Object.keys(map).length>=6)return {r,map};}return null;}
function cached(s,a){const c=s.cells[a];return numeric(c?.value)?c.value:(c?.formula?null:c?.value===null||!c?0:null);}

/* Dados que já estão nos documentos: projeto e início (Posição Financeira), última competência realizada, duração (texto do PUR ou planilha de apoio). */
export function financialInfo(fin){
 const pos=findSheet(fin,'posicao financeira');if(!pos)throw Error('Não encontrei a aba Posição Financeira no relatório financeiro.');
 const comps=[];for(let c=13;c<=80;c++){const mm=month(at(pos,7,c));if(mm!==null)comps.push({mm,real:norm(at(pos,6,c))==='realizado'});}
 let start=month(pos.get('L1'));if(start===null&&comps.length)start=comps[0].mm;
 const done=comps.filter(x=>x.real&&start!==null&&x.mm>=start).map(x=>x.mm);
 const project=pos.get('C6');
 return {project:typeof project==='string'?project.trim():'',start,lastClosed:done.length?Math.max(...done):null};
}
export function durationFromText(text){
 const s=norm(text);
 for(const re of [/(?:prazo|duracao|vigencia|periodo)[^0-9]{0,60}?(\d{1,2})\s*(?:\([^)]*\)\s*)?mes(?:es)?\b/,/\b(\d{1,2})\s*(?:\([^)]*\)\s*)?mes(?:es)?\s*(?:de\s+)?(?:execucao|duracao|vigencia)/]){
  const m=s.match(re);if(m&&+m[1]>=1&&+m[1]<=24)return +m[1];}
 return null;
}
export function planDuration(plan){
 if(!plan)return null;const schedule=Object.values(plan.sheets).find(s=>norm(s.name).includes('cronograma fisico'))||findSheet(plan,'valores previstos');
 const header=schedule&&monthsHeader(schedule);if(!header)return null;const n=Math.max(...Object.keys(header.map).map(Number))+1;return n>=1&&n<=24?n:null;
}
export function extract(fin,plan,options){
 const {start,duration,closed,pdf}=options;const data={...options,values:{},sources:{},notices:[],files:{}};delete data.pdf;
 for(const cat of categories){data.values[cat]={};data.sources[cat]={};for(const r of cat==='RHD'||cat==='RHI'?[2,3,10,11,15,16]:[2,3]){data.values[cat][r]=Array(duration).fill(null);data.sources[cat][r]=Array(duration).fill('Não identificado');}}
 // Plan schedule is the authoritative planned source. No silent fallback to old financial baseline.
 plan=plan||{sheets:{}};let schedule=Object.values(plan.sheets).find(s=>norm(s.name).includes('cronograma fisico'))||findSheet(plan,'valores previstos');
 const header=schedule&&monthsHeader(schedule);
 if(header){for(const r of rowsOf(schedule).filter(r=>r>header.r)){
  let cat=null;for(let c=1;c<=3&&!cat;c++)cat=rubrica(at(schedule,r,c));if(!cat)continue;
  for(let m=0;m<duration;m++){const c=header.map[m];if(c)set(data,cat,2,m,cached(schedule,col(c)+r),`${schedule.name}!${col(c)}${r}`);}
 }}else if(schedule)data.notices.push('Cronograma mensal da planilha de apoio não reconhecido.');
 // Monthly RH assignments in the support workbook. A function repeated in multiple stages is counted once per month.
 const rh=findSheet(plan,'plano de trabalho');let group=null,head=null;const rhParts={RHD:[],RHI:[]};
 if(rh)for(const r of rowsOf(rh)){
  const label=rh.get('A'+r),cat=rubrica(label);const local={};for(let c=1;c<=35;c++){const mat=norm(at(rh,r,c)).match(/^mes\s*(\d{1,2})$/);if(mat)local[+mat[1]-1]=c;}
  if(Object.keys(local).length>=6){group=['RHD','RHI'].includes(cat)?cat:null;head=local;continue;}
  if(group&&head&&typeof label==='string'&&label.trim()&&label.trim()!=='-')rhParts[group].push({r,label:label.trim(),head});
 }
 for(const cat of ['RHD','RHI'])if(rhParts[cat].length){for(let m=0;m<duration;m++){
  let sum=0,missing=false;const people=new Set(),refs=[];
  for(const p of rhParts[cat]){if(!p.head[m]){missing=true;continue;}const a=col(p.head[m])+p.r;const v=cached(rh,a);if(v===null){missing=true;continue;}sum+=v;if(v>0)people.add(norm(p.label));refs.push(a);}
  set(data,cat,15,m,missing?null:sum,`${rh.name}!${refs.join(',')}`);set(data,cat,10,m,missing?null:people.size,`${rh.name}: funções distintas com horas > 0; conferir vagas com mesma função`);
 }data.notices.push(`${cat}: profissionais previstos foram contados por função distinta. Confira se existem duas ou mais vagas com o mesmo nome de função.`);}
 if(pdf)applyPdf(data,pdf);
 if(categories.every(cat=>data.values[cat][2].every(v=>v===null)))data.notices.push('Cronograma mensal de dispêndios não reconhecido no PUR nem na planilha de apoio. Complete o planejado na conferência.');
 const pos=findSheet(fin,'posicao financeira');if(!pos)throw Error('Não encontrei a aba Posição Financeira no relatório financeiro.');
 const project=pos.get('C6');data.detectedProject=typeof project==='string'?project:'';
 const detectedStart=month(pos.get('L1'));if(detectedStart!==null&&detectedStart!==start)data.notices.push('O início informado difere da célula L1 da Posição Financeira. Confira a competência inicial antes de exportar.');
 // Calendar month matching, never assume the first financial column is project month 1.
 const map={};for(let c=13;c<=80;c++){const mm=month(at(pos,7,c));if(mm!==null&&mm>=start&&mm<start+duration){if(map[mm])throw Error('Competência duplicada na Posição Financeira dentro do projeto.');map[mm]=c;}}
 for(const r of rowsOf(pos)){const cat=rubrica(pos.get('B'+r));if(!cat)continue;
  const realRow=[r+1,r+2,r+3].find(k=>norm(pos.get('L'+k)).startsWith('real.'));if(!realRow)continue;
  for(let m=0;m<closed;m++){const c=map[start+m];if(!c)continue;const state=norm(at(pos,6,c));if(state!=='realizado'){data.notices.push(`${cat}, mês ${m+1}: competência não marcada como Realizado na Posição Financeira.`);continue;}const a=col(c)+realRow;set(data,cat,3,m,pos.get(a),`${pos.name}!${a}`);}
 }
 for(const cat of ['RHD','RHI']){
  const s=Object.values(fin.sheets).find(s=>norm(s.name).includes(cat.toLowerCase())&&norm(s.name).includes('abertura'));if(!s){data.notices.push(`Abertura de pagamentos ${cat} não encontrada.`);continue;}
  let hr=null,cols={};for(const r of rowsOf(s).slice(0,20)){const co={};for(let c=1;c<=65;c++){const h=norm(at(s,r,c));if(h==='data')co.date=c;if(h.includes('nome')&&(h.includes('funcionario')||h.includes('profissional')))co.name=c;if(h==='cpf')co.id=c;if(h.includes('horas trabalhadas'))co.hours=c;}if(co.date&&co.name&&co.hours){hr=r;cols=co;break;}}
  if(!hr){data.notices.push(`Cabeçalhos de ${cat} não reconhecidos. Complete pessoas e horas manualmente.`);continue;}
  const sums=Array(closed).fill(0),people=Array.from({length:closed},()=>new Set()),bad=new Set();
  for(const r of rowsOf(s).filter(r=>r>hr)){const name=at(s,r,cols.name);if(typeof name!=='string'||!name.trim())continue;const mm=month(at(s,r,cols.date));if(mm===null){data.notices.push(`${cat}, linha ${r}: pessoa sem competência reconhecida.`);for(let m=0;m<closed;m++)bad.add(m);continue;}const m=mm-start;if(m<0||m>=closed)continue;const hours=at(s,r,cols.hours);if(!numeric(hours)||hours<0){bad.add(m);continue;}sums[m]+=hours;const id=cols.id?at(s,r,cols.id):null;people[m].add(id?String(id).replace(/\D/g,''):norm(name));}
  for(let m=0;m<closed;m++){set(data,cat,11,m,bad.has(m)?null:people[m].size,`${s.name}: pessoas distintas por CPF/nome na competência`);set(data,cat,16,m,bad.has(m)?null:sums[m],`${s.name}: soma da coluna ${col(cols.hours)} na competência`);}
 }
 if(missing(data)&&Object.values(fin.sheets).some(s=>Object.values(s.cells).some(c=>c.formula&&c.value===null)))data.notices.push('Há fórmulas sem resultado salvo no financeiro. Se uma pendência depender delas, recalcule e salve o arquivo no Excel antes de importar novamente.');
 data.notices=[...new Set(data.notices)];return data;
}
/* O PUR em PDF é a fonte principal do planejado; a planilha de apoio só completa o que o PDF não trouxe. */
function applyPdf(data,pdf){
 const diverge=[];
 for(const cat of categories)for(const row of Object.keys(pdf.values[cat]||{}))for(let m=0;m<data.duration;m++){
  const v=pdf.values[cat][row][m];if(v===null||v===undefined)continue;const old=data.values[cat][row][m];
  if(old!==null&&Math.abs(old-v)>.005)diverge.push(`${cat} ${inputRows[row]} mês ${m+1}`);
  set(data,cat,+row,m,v,pdf.sources[cat][row][m]);}
 if(diverge.length)data.notices.push(`PUR em PDF e planilha de apoio divergem em ${diverge.length} campo(s); foi usado o PDF: ${diverge.slice(0,8).join(', ')}${diverge.length>8?'…':''}.`);
 data.notices.push(...pdf.notices);
}
export function missing(data){let n=0;for(const cat of categories)for(const [row,values]of Object.entries(data.values[cat]))for(let m=0;m<values.length;m++){if([3,11,16].includes(+row)&&m>=data.closed)continue;if(values[m]===null)n++;}return n;}
export function calculated(data,cat,row,m){const v=data.values[cat];if(v[row])return v[row][m];let a,b;if(row===4)a=2;if(row===5)a=3;if(row===17)a=15;if(row===18)a=16;if(a){const values=v[a].slice(0,m+1);if(values.some(x=>x===null))return null;return values.reduce((x,y)=>x+y,0);}if(row===6){a=calculated(data,cat,5,m);b=calculated(data,cat,4,m);}if(row===19){a=calculated(data,cat,18,m);b=calculated(data,cat,17,m);}return a===null||b===null?null:b===0?'#DIV/0!':a/b;}
export async function referenceText(file){const zip=await JSZip.loadAsync(await file.arrayBuffer());const body=await zip.file('word/document.xml')?.async('string');if(!body)throw Error('Documento Word inválido.');return tags(xml(body),'p').map(p=>tags(p,'t').map(t=>t.textContent).join('')).join('\n').slice(0,200000);}
export async function exportWorkbook(data,template){
 if(missing(data))throw Error('Preencha os campos pendentes antes de gerar.');
 const book=template?await openWorkbook(await template.arrayBuffer()):await blankTemplate();
 for(const cat of categories){const s=book.sheets[cat];if(!s)throw Error(`O modelo não possui a aba ${cat}.`);const allowed=Object.keys(data.values[cat]).map(Number);const rowNumbers=cat==='RHD'||cat==='RHI'?[1,2,3,4,5,6,9,10,11,14,15,16,17,18,19]:[1,2,3,4,5,6];
  const sheetData=tags(s.doc,'sheetData')[0];
  for(const r of rowNumbers){let row=tags(sheetData,'row').find(x=>+x.getAttribute('r')===r);if(!row){row=s.doc.createElementNS(NS,'row');row.setAttribute('r',r);sheetData.append(row);}
   for(let m=0;m<Math.max(12,data.duration);m++){const a=col(m+2)+r;let cell=tags(row,'c').find(x=>x.getAttribute('r')===a);if(!cell){const base=tags(row,'c').find(x=>x.getAttribute('r')==='M'+r)||tags(row,'c').find(x=>x.getAttribute('r')==='B'+r);cell=base?base.cloneNode(true):s.doc.createElementNS(NS,'c');cell.setAttribute('r',a);row.append(cell);}cell.removeAttribute('t');while(cell.firstChild)cell.removeChild(cell.firstChild);
    const elem=(n,text)=>{const el=s.doc.createElementNS(NS,n);el.textContent=text;cell.append(el);};
    if([1,9,14].includes(r)){cell.setAttribute('t','inlineStr');const is=s.doc.createElementNS(NS,'is'),t=s.doc.createElementNS(NS,'t');t.textContent=`Mês ${m+1}`;is.append(t);cell.append(is);continue;}
    if(m>=data.duration)continue;
    if(allowed.includes(r)){const value=data.values[cat][r][m];if(value!==null)elem('v',String(value));}
    else {const cc=col(m+2),prev=col(m+1);const formula={4:`${cc}2${m?'+'+prev+'4':''}`,5:`${cc}3${m?'+'+prev+'5':''}`,6:`${cc}5/${cc}4`,17:`${cc}15${m?'+'+prev+'17':''}`,18:`${cc}16${m?'+'+prev+'18':''}`,19:`${cc}18/${cc}17`}[r];elem('f',formula);const val=calculated(data,cat,r,m);if(typeof val==='string'){cell.setAttribute('t','e');elem('v',val);}else if(val!==null)elem('v',String(val));}
   }
  }
  const dim=tags(s.doc,'dimension')[0];if(dim)dim.setAttribute('ref',`A1:${col(Math.max(data.duration,12)+1)}${cat==='RHD'||cat==='RHI'?19:6}`);
  if(data.duration>12){const cols=tags(s.doc,'cols')[0];if(cols){const c=s.doc.createElementNS(NS,'col');c.setAttribute('min','14');c.setAttribute('max',String(data.duration+1));c.setAttribute('width','15');c.setAttribute('customWidth','1');cols.append(c);}}
  book.zip.file(s.path,new XMLSerializer().serializeToString(s.doc));
 }
 const calc=tags(book.wb,'calcPr')[0];if(calc){calc.setAttribute('fullCalcOnLoad','1');calc.setAttribute('forceFullCalc','1');}
 book.zip.file('xl/workbook.xml',new XMLSerializer().serializeToString(book.wb));
 // Remove stale calculation chain and its metadata after changing inputs/formulas.
 book.zip.remove('xl/calcChain.xml');for(const path of ['[Content_Types].xml','xl/_rels/workbook.xml.rels']){const doc=xml(await book.zip.file(path).async('string'));for(const e of Array.from(doc.documentElement.children))if((e.getAttribute('PartName')||e.getAttribute('Target')||'').includes('calcChain'))e.remove();book.zip.file(path,new XMLSerializer().serializeToString(doc));}
 return book.zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',compression:'DEFLATE'});
}
async function blankTemplate(){
 const z=new JSZip(),names=['Instruções',...categories];
 const text=(a,t,style=0)=>`<c r="${a}" s="${style}" t="inlineStr"><is><t>${escape(t)}</t></is></c>`;
 z.file('[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((n,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
 z.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
 z.file('xl/workbook.xml',`<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n,i)=>`<sheet name="${escape(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
 z.file('xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((n,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
 z.file('xl/styles.xml',`<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF275F43"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="3" borderId="0" xfId="0"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
 const labels={1:'Indicador',2:'R$ PUR',3:'R$ Realizado',4:'R$ PUR Acum.',5:'R$ Realiz. Acum.',6:'% R$ Acum.',9:'Indicador',10:'Profissionais PUR',11:'Profissionais Realizado',14:'Indicador',15:'Horas PUR',16:'Horas Realizadas',17:'Horas PUR Acum.',18:'Horas Realiz. Acum.',19:'% Horas Acum.'};
 names.forEach((name,i)=>{let rows='';if(i===0){rows=`<row r="1">${text('A1','Indicadores gerenciais — PPI 4.0',1)}</row><row r="3">${text('A3','Planejado: PUR ou último adendo aprovado. Realizado: fechamento financeiro.')}</row><row r="4">${text('A4','Mês 1 corresponde ao início da execução. Percentual = acumulado realizado / planejado.')}</row><row r="5">${text('A5','Denominador zero mantém #DIV/0! para explicitar ausência de base.')}</row>`;}else for(const r of [1,2,3,4,5,6,...(['RHD','RHI'].includes(name)?[9,10,11,14,15,16,17,18,19]:[])]){rows+=`<row r="${r}" ht="24" customHeight="1">${text('A'+r,labels[r],[1,9,14].includes(r)?1:0)}${Array.from({length:12},(_,m)=>`<c r="${col(m+2)}${r}" s="${[1,9,14].includes(r)?1:[2,3,10,11,15,16].includes(r)?2:[6,19].includes(r)?3:0}"/>`).join('')}</row>`;}
 z.file(`xl/worksheets/sheet${i+1}.xml`,`<worksheet xmlns="${NS}"><dimension ref="A1:M19"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="${i===0?110:28}" customWidth="1"/><col min="2" max="25" width="15" customWidth="1"/></cols><sheetData>${rows}</sheetData></worksheet>`);});
 return openWorkbook(await z.generateAsync({type:'uint8array'}));
}
