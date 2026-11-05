const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch(),p=await b.newPage();await p.goto(process.argv[2]+'/tests.html');
await p.waitForFunction(()=>document.body.dataset.result,null,{timeout:60000});
console.log(await p.evaluate(()=>document.getElementById('result').textContent));await b.close();})().catch(e=>{console.error(e);process.exit(1)});
