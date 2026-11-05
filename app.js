import {categories,inputRows,openWorkbook,extract,missing,calculated,exportWorkbook,referenceText,number,month,financialInfo,durationFromText,planDuration} from './engine.js';
import {readPurPdf} from './pur-v2.js';
const $=id=>document.getElementById(id);let data=null,abort=null,active=categories[0],snapshot='';
const format=(v,pct=false)=>v===null?'Pendente':typeof v==='string'?v:new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2,...(pct?{style:'percent'}:{})}).format(v);
function status(t,error=false){$('status').textContent=t;$('status').classList.toggle('error',error);}
function signature(){return JSON.stringify(['closed','approved'].map(id=>$(id).type==='checkbox'?$(id).checked:$(id).value));}
function invalidate(){data=null;$('review').hidden=true;$('reviewed').checked=false;status('Documentos ou parâmetros alterados. Extraia novamente para atualizar a conferência.');}
const ym=mm=>`${Math.floor(mm/12)}-${String(mm%12+1).padStart(2,'0')}`,label=mm=>`${String(mm%12+1).padStart(2,'0')}/${Math.floor(mm/12)}`;
for(const id of ['finance','pur','plan','template','closed','approved'])$(id).addEventListener('change',invalidate);
$('finance').addEventListener('change',async()=>{const f=$('finance').files[0];$('detected').textContent='';if(!f)return;
 try{const info=financialInfo(await openWorkbook(await f.arrayBuffer(),'financial'));
  const parts=[];if(info.project)parts.push('Projeto: '+info.project);if(info.start!==null)parts.push('início: '+label(info.start));
  $('detected').textContent=parts.length?'Identificado no financeiro — '+parts.join(' · ')+'. O prazo é lido do PUR.':'';
  if(info.lastClosed!==null&&!$('closed').value)$('closed').value=ym(info.lastClosed);}catch{}});
$('analyze').addEventListener('click',async()=>{
 try{data=null;$('review').hidden=true;const fin=$('finance').files[0],pur=$('pur').files[0],plan=$('plan').files[0];if(!fin||!pur)throw Error('Selecione a planilha financeira preenchida e o PUR (ou último adendo).');if(!$('approved').checked)throw Error('Confirme que o PUR é o último adendo aprovado.');if(!/^\d{4}-\d{2}$/.test($('closed').value))throw Error('Informe a competência do fechamento (mês/ano).');for(const f of [fin,pur,plan].filter(Boolean))if(f.size>30*1024*1024)throw Error('Cada arquivo deve ter até 30 MB.');$('analyze').disabled=true;abort=new AbortController();$('cancel').hidden=false;
 status('Lendo a planilha financeira…');
 const [f,p]=await Promise.all([openWorkbook(await fin.arrayBuffer(),'financial'),plan?openWorkbook(await plan.arrayBuffer(),'plan'):null]);
 const info=financialInfo(f);if(info.start===null)throw Error('Não encontrei o início do projeto na Posição Financeira (célula L1 ou competências na linha 7).');
 const start=info.start,isPdf=/\.pdf$/i.test(pur.name);let pdf=null,reference='',duration=null;
 status(isPdf?'Lendo o PUR em PDF…':'Lendo o PUR em Word…');
 if(isPdf){pdf=await readPurPdf(pur,{start,signal:abort.signal,onProgress:t=>status(t)});reference=pdf.text;duration=pdf.duration;}else{reference=await referenceText(pur);duration=durationFromText(reference)||planDuration(p);}
 if(!duration)throw Error('Não encontrei a quantidade de meses no PUR. Verifique se o PDF tem texto selecionável ou envie a planilha de apoio.');
 const closed=month($('closed').value)-start+1;
 if(closed<1||closed>duration)throw Error(`A competência de fechamento ${label(month($('closed').value))} está fora do projeto (${label(start)} a ${label(start+duration-1)}, ${duration} meses).`);
 status('Cruzando as competências…');
 data=extract(f,p,{project:info.project,start,duration,closed,pdf});if(!isPdf)data.notices.unshift('PUR em Word serve só para consulta: o planejado vem da planilha de apoio ou da conferência manual.');
 data.notices.unshift(`Início ${label(start)} (financeiro), ${duration} meses (PUR), fechamento ${label(month($('closed').value))} = mês ${closed}.`);
 if(pdf?.adendo?.usedPara)data.notices.unshift('Fonte do adendo: quadros PARA. Confira se o documento é consolidado e se as rubricas não alteradas estão contempladas.');
 data.files={financial:fin.name,pur:pur.name,plan:plan?.name||null,template:$('template').files[0]?.name||'Modelo interno equivalente'};
 $('reftext').textContent=reference;$('refbox').hidden=!reference;
 snapshot=signature();$('reviewed').checked=false;active=categories[0];$('review').hidden=false;renderNotices();render();status('Extração concluída. Confira os campos pendentes e as fontes, marque a conferência e clique em Gerar relatório .xlsx.');$('review').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){if(e.name==='AbortError')status('Leitura cancelada. Os arquivos continuam selecionados; clique em Extrair e conferir para tentar de novo.');else status(e.message||'Não foi possível ler os arquivos.',true);}finally{$('analyze').disabled=false;$('cancel').hidden=true;abort=null;}
});
$('cancel').addEventListener('click',()=>{if(abort){abort.abort();$('cancel').disabled=true;status('Cancelando…');setTimeout(()=>{$('cancel').disabled=false;},500);}});
function renderNotices(){const root=$('notices');root.replaceChildren();for(const n of data.notices){const d=document.createElement('div');d.className='notice';d.textContent=n;root.append(d);}if(data.detectedProject){const d=document.createElement('p');d.className='help';d.textContent='Nome identificado no financeiro: '+data.detectedProject;root.prepend(d);}}
function updateCounts(){const n=missing(data);$('counts').textContent=n?`${n} campos pendentes`:'Todos os campos preenchidos';$('export').disabled=!!n||!$('reviewed').checked;}
function render(){
 $('tabs').replaceChildren();for(const cat of categories){const b=document.createElement('button');b.textContent=cat;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(active===cat));b.addEventListener('click',()=>{active=cat;render();});$('tabs').append(b);}
 const table=document.createElement('table'),thead=table.createTHead(),h=thead.insertRow();h.append(document.createElement('th'));h.cells[0].textContent='Indicador';for(let m=0;m<data.duration;m++){const th=document.createElement('th');const dt=new Date(Date.UTC(Math.floor((data.start+m)/12),(data.start+m)%12,1));th.textContent=`M${m+1} · ${dt.toLocaleDateString('pt-BR',{month:'short',year:'2-digit',timeZone:'UTC'})}`;h.append(th);}
 const body=table.createTBody();for(const row of [2,3,4,5,6,...(['RHD','RHI'].includes(active)?[10,11,15,16,17,18,19]:[])]){
  const tr=body.insertRow(),th=document.createElement('th');th.textContent=inputRows[row]||{4:'R$ PUR acumulado',5:'R$ realizado acumulado',6:'% R$ acumulado',17:'Horas PUR acumuladas',18:'Horas realizadas acumuladas',19:'% horas acumuladas'}[row];tr.append(th);
  for(let m=0;m<data.duration;m++){const td=tr.insertCell();const future=[3,5,6,11,16,18,19].includes(row)&&m>=data.closed;if(future){td.textContent='—';td.className='future';continue;}const v=calculated(data,active,row,m);
   if(data.values[active][row]){const input=document.createElement('input');input.type='text';input.inputMode='decimal';input.value=v===null?'':String(v).replace('.',',');input.setAttribute('aria-label',`${active}, ${inputRows[row]}, mês ${m+1}`);input.title=data.sources[active][row][m];td.classList.toggle('missing',v===null);input.addEventListener('change',()=>{try{const n=number(input.value);if(n!==null&&n<0)throw Error('Valores negativos exigem conferência na origem.');if([10,11].includes(row)&&n!==null&&!Number.isInteger(n))throw Error('Profissionais deve ser inteiro.');data.values[active][row][m]=n;data.sources[active][row][m]='Ajuste manual na conferência (fonte anterior: '+data.sources[active][row][m]+')';$('reviewed').checked=false;render();}catch(e){status(e.message,true);input.value=v===null?'':String(v).replace('.',',');}});td.append(input);
   }else td.textContent=format(v,[6,19].includes(row));
  }
 }$('grid').replaceChildren(table);updateCounts();
}
$('reviewed').addEventListener('change',()=>data&&updateCounts());
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function stem(){return (data.project||'Indicadores').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,80);}
$('export').addEventListener('click',async()=>{if(!data)return;try{if(signature()!==snapshot)throw Error('Parâmetros alterados. Extraia novamente.');$('export').disabled=true;status('Gerando o Excel com os valores conferidos…');const blob=await exportWorkbook(data,$('template').files[0]);download(blob,stem()+'_Indicadores.xlsx');status('Relatório gerado. A memória de preenchimento pode ser baixada separadamente.');}catch(e){status(e.message,true);}finally{updateCounts();}});
$('audit').addEventListener('click',()=>{if(data)download(new Blob([JSON.stringify({...data,generatedAt:new Date().toISOString()},null,2)],{type:'application/json'}),stem()+'_Memoria.json');});
