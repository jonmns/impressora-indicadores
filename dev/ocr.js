// Fluxo completo com o PUR digitalizado sintetico, comparando com os valores verdadeiros.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
(async()=>{const [base,fx]=process.argv.slice(2),truth=JSON.parse(fs.readFileSync(path.join(fx,'scan_truth.json'))).para;
 const b=await chromium.launch(),p=await b.newPage();const logs=[];p.on('pageerror',e=>logs.push('ERR '+e.message));p.on('console',m=>{if(m.type()==='error')logs.push(m.text())});
 await p.goto(base+'/index.html');await p.setInputFiles('#finance',path.join(fx,'financeiro.xlsx'));await p.setInputFiles('#pur',path.join(fx,'Adendo_scan.pdf'));await p.fill('#closed','2026-09');await p.check('#approved');
 const t0=Date.now();await p.click('#analyze');
 await p.waitForFunction(()=>!document.getElementById('analyze').disabled,null,{timeout:300000});
 const r=await p.evaluate(async()=>{const m=await import('./pur-v2.js');const f=document.getElementById('pur').files[0];const x=await m.readPurPdf(f,{start:document.querySelector('#closed')&&2026*12+8});return {status:document.getElementById('status').textContent,err:document.getElementById('status').classList.contains('error'),notices:[...document.querySelectorAll('#notices .notice')].map(n=>n.textContent),dur:x.duration,values:Object.fromEntries(Object.entries(x.values).map(([k,v])=>[k,v[2]])),totals:x.totals,src:x.sources.RHD[2][0]};});
 console.log('tempo',Math.round((Date.now()-t0)/1000)+'s');console.log(r.status,r.err);console.log(r.notices.join('\n'));console.log('duracao',r.dur,'fonte',r.src);
 const map={Equipamentos:'prog','Laboratório':'lab',RHD:'rhd',RHI:'rhi',Materiais:'mat',STT:'stt',Correlatos:'cor'};let ok=0,bad=0,miss=0;
 for(const [c,k] of Object.entries(map)){const v=r.values[c],t=truth[k];t.forEach((x,i)=>{const y=v[i];if(y===null||y===undefined)miss++,console.log('faltou',c,i+1,x);else if(Math.abs(y-x)<.005)ok++;else bad++,console.log('errado',c,i+1,'real',x,'lido',y);});}
 console.log({ok,bad,miss});console.log(logs.slice(0,5).join('\n'));await b.close();})().catch(e=>{console.error(e);process.exit(1)});
