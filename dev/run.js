// Percorre o fluxo real da pagina (upload + "Extrair e conferir") para cada PUR sintetico.
const {chromium}=require('playwright');const path=require('path');
(async()=>{
 const [base,fx]=process.argv.slice(2);
 const b=await chromium.launch(),res={};
 for(const name of ['pur_cabecalho_normal','pur_cabecalho_mesano','pur_cabecalho_m1','pur_cabecalho_vertical']){
  const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(base+'/index.html');
  await p.setInputFiles('#finance',path.join(fx,'financeiro.xlsx'));
  await p.setInputFiles('#pur',path.join(fx,name+'.pdf'));
  await p.fill('#closed','2026-09');
  await p.check('#approved');
  await p.click('#analyze');
  await p.waitForFunction(()=>!document.getElementById('analyze').disabled&&!/Lendo|Cruzando/.test(document.getElementById('status').textContent),null,{timeout:30000});
  const out=await p.evaluate(()=>({status:document.getElementById('status').textContent,isErr:document.getElementById('status').classList.contains('error'),review:!document.getElementById('review').hidden,notices:[...document.querySelectorAll('#notices .notice')].map(n=>n.textContent).slice(0,6),cols:document.querySelectorAll('#grid thead th').length-1,first:document.querySelector('#grid tbody input')?.value}));
  console.log(name,JSON.stringify({...out,errs},null,0));await p.close();
 }
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
