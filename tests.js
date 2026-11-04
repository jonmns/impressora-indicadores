import {categories,NS,openWorkbook,extract,exportWorkbook,missing,calculated,number,month} from './engine.js';
const out=document.getElementById('result');let passed=0;
const assert=(c,m)=>{if(!c)throw Error(m);passed++;};
const sheet=(name,cells)=>({name,cells:Object.fromEntries(Object.entries(cells).map(([a,v])=>[a,typeof v==='object'?v:{value:v,formula:null}])),get(a){return this.cells[a]?.value??null;}});
try{
 assert(number('1.234,56')===1234.56,'número brasileiro');assert(number('0')===0,'zero');assert(number('')===null,'ausente');assert(month('2026-09')===2026*12+8,'mês');
 const planCells={A2:'Rubricas'},posCells={C6:'Projeto sintético',L1:46266,M7:46266,N7:46296,M6:'Realizado',N6:'planejado'};
 const labels=['I - programas de computador','II - laboratório','III a - recursos humanos diretos','III b - recursos humanos indiretos','V - materiais de consumo','VIII - serviços técnicos de terceiros','IX - outros correlatos'];
 for(let m=0;m<12;m++)planCells[String.fromCharCode(66+m)+'2']='Mês '+(m+1);
 labels.forEach((label,i)=>{planCells['A'+(i+3)]=label;for(let m=0;m<12;m++)planCells[String.fromCharCode(66+m)+(i+3)]=100+i;const r=9+i*4;posCells['B'+r]=label;posCells['L'+(r+2)]='Real.';posCells['M'+(r+2)]=10+i;posCells['N'+(r+2)]=999;});
 const pay={B6:'Data',C6:'Nome do Funcionário',D6:'CPF',J6:'Horas Trabalhadas',K6:'Salário',B7:46266,C7:'Ana',D7:'123',J7:10,K7:9000,B8:46266,C8:'Ana',D8:'123',J8:5,K8:9000,B9:46296,C9:'Outra',D9:'456',J9:100};
 const fin={sheets:{pos:sheet('Posição Financeira',posCells),direct:sheet('III.I RHD_Abertura_Pgtos',pay),indirect:sheet('IV.I - RHI_Abertura_Pgtos',pay)}};
 const plan={sheets:{schedule:sheet('7.2 Cronograma Fisico_Finc.',planCells)}};
 const start=month(46266),data=extract(fin,plan,{project:'Sintético',start,duration:12,closed:1});
 assert(data.values.RHD[16][0]===15,'horas vêm de J, não salário K');assert(data.values.RHD[11][0]===1,'CPF duplicado não duplica pessoas');assert(data.values.RHD[3][1]===null,'outubro projetado fica vazio');assert(data.values.Equipamentos[3][0]===10,'rubricas mapeadas');
 assert(missing(data)>0,'RH planejado ausente precisa completar');
 let blocked=false;try{await exportWorkbook(data);}catch{blocked=true;}assert(blocked,'ausência bloqueia exportação');
 for(const cat of categories)for(const [r,v]of Object.entries(data.values[cat]))for(let m=0;m<v.length;m++)if(v[m]===null&&(![3,11,16].includes(+r)||m<data.closed))v[m]=0;
 assert(missing(data)===0,'zero explícito é válido');assert(calculated(data,'Equipamentos',6,0)===.1,'percentual acumulado');
 const blob=await exportWorkbook(data),book=await openWorkbook(await blob.arrayBuffer());assert(book.sheets.RHD.get('B16')===15,'exportação preserva horas');assert(book.sheets.RHD.get('C3')===null,'exportação sem realizado futuro');assert(book.sheets.Equipamentos.cells.B4.formula==='B2','fórmula preservada');assert(book.sheets.Equipamentos.get('B6')===.1,'cache percentual calculado');assert(book.sheets['Laboratório'].get('M2')===101,'último mês planejado');
 data.duration=24;for(const cat of categories)for(const [r,v]of Object.entries(data.values[cat]))while(v.length<24)v.push([3,11,16].includes(+r)?null:0);
 const extended=await openWorkbook(await (await exportWorkbook(data)).arrayBuffer());assert(extended.sheets.RHD.get('Y1')==='Mês 24','extensão até 24');assert(extended.sheets.RHD.cells.Y17.formula==='Y15+X17','fórmula mês 24');
 data.values.Equipamentos[2][0]=null;assert(missing(data)===1,'alteração volta a expor pendência');
 out.textContent=`PASSOU — ${passed} verificações.\nExtração, salário versus horas, CPF duplicado, competências, ausência versus zero, bloqueio, cálculos e exportação 12/24 meses.`;document.body.dataset.result='passed';
}catch(e){out.textContent=`FALHOU após ${passed} verificações: ${e.stack}`;document.body.dataset.result='failed';}
