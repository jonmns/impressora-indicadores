/* Horas previstas de RH a partir do "Detalhamento dos recursos financeiros" do PUR:
 * tabelas c) Recursos Humanos Diretos e d) Recursos Humanos Indiretos, uma linha por cargo com horas totais, custo/hora e valor.
 * Em adendo vale a tabela PARA. A tabela só é aceita se a soma dos valores das linhas fechar com a linha TOTAL. */
import {pdfNumber} from './pur-pdf.js';

const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const money=t=>pdfNumber(t);
// Últimos três números da linha: horas totais, custo/hora e valor. "R$" solto é descartado.
function tail(text){
 const tokens=String(text).replace(/R\$\s*/g,'').trim().split(/\s+/);if(tokens.length<4)return null;
 const [h,c,v]=tokens.slice(-3).map(money);const label=tokens.slice(0,-3).join(' ');
 if([h,c,v].some(x=>x===null||x<0)||!/\d/.test(tokens.at(-3)))return null;
 return {label:label.replace(/^\d{1,2}\s+/,'').trim(),hours:h,rate:c,value:v};
}
export function rhTotals(pages,file='PUR.pdf'){
 let inDetail=false,section=null,state='ALL';const tables={};
 pages.forEach((lines,p)=>lines.forEach(line=>{
  const t=norm(line.text);if(!t)return;
  if(/detalhamento dos recursos financeiros/.test(t)){inDetail=true;return;}
  if(!inDetail)return;
  if(/^(de|para)\s*:?$/.test(t)){state=t.startsWith('para')?'PARA':'DE';return;}
  const head=t.match(/^([a-z])\)\s*(.*)$/);
  if(head){section=/recursos humanos indiretos/.test(head[2])?'RHI':/recursos humanos diretos/.test(head[2])?'RHD':null;state='ALL';return;}
  if(!section)return;
  const key=section+'|'+state,table=tables[key]||(tables[key]={cat:section,state,rows:[],total:null,pages:new Set()});
  if(/^total\b/.test(t)){const v=money(String(line.text).replace(/^\s*total\s*/i,''));if(v!==null)table.total=v;return;}
  const row=tail(line.text);if(row&&row.label&&!/^#|descricao/.test(norm(row.label))){table.rows.push(row);table.pages.add(p+1);}
 }));
 const out={},notices=[];
 for(const cat of ['RHD','RHI']){
  const table=tables[cat+'|PARA']||tables[cat+'|ALL'];
  if(!table||!table.rows.length)continue;
  const sum=table.rows.reduce((a,r)=>a+r.value,0);
  if(table.total===null||Math.abs(sum-table.total)>1){notices.push(`${cat}: a tabela de horas do detalhamento financeiro não fecha com o total (${sum.toFixed(2)} × ${table.total===null?'sem total':table.total.toFixed(2)}). Horas previstas ficam pendentes.`);continue;}
  const hours=Math.round(table.rows.reduce((a,r)=>a+r.hours,0)*100)/100;
  out[cat]={hours,people:table.rows.filter(r=>r.hours>0).length,rows:table.rows,where:`${file}, p. ${[...table.pages].join(', ')}, detalhamento dos recursos financeiros${table.state==='PARA'?' (PARA)':''}`};
 }
 return {totals:out,notices};
}
