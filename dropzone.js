/* Arrastar e soltar, sem upload remoto. Integrado aos inputs de arquivo existentes. */
const extensions={finance:['xlsx','xlsm'],pur:['pdf','docx'],plan:['xlsx','xlsm'],template:['xlsx']};
for(const [id,allowed] of Object.entries(extensions)){
 const input=document.getElementById(id);if(!input)continue;
 const zone=id==='finance'||id==='pur'?input.closest('.upload'):input.closest('label');
 if(!zone)continue;
 zone.classList.add('drop-zone');
 const info=document.createElement('span');info.className='drop-hint';info.textContent='Arraste o arquivo aqui ou clique em Escolher Arquivo';
 input.insertAdjacentElement('beforebegin',info);
 let depth=0;
 zone.addEventListener('dragenter',e=>{e.preventDefault();depth++;zone.classList.add('drag-over');});
 zone.addEventListener('dragover',e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';});
 zone.addEventListener('dragleave',e=>{e.preventDefault();depth=Math.max(0,depth-1);if(!depth)zone.classList.remove('drag-over');});
 zone.addEventListener('drop',e=>{
  e.preventDefault();depth=0;zone.classList.remove('drag-over');
  const files=[...(e.dataTransfer?.files||[])];
  if(files.length!==1){info.textContent='Arraste apenas um arquivo por campo.';zone.classList.add('drop-error');return;}
  const file=files[0],ext=file.name.split('.').pop().toLowerCase();
  if(!allowed.includes(ext)||file.size>30*1024*1024){info.textContent='Formato inválido ou arquivo maior que 30 MB.';zone.classList.add('drop-error');return;}
  const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;
  zone.classList.remove('drop-error');info.textContent='Arquivo: '+file.name;
  input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 input.addEventListener('change',()=>{zone.classList.remove('drop-error');info.textContent=input.files[0]?'Arquivo: '+input.files[0].name:'Arraste o arquivo aqui ou clique em Escolher Arquivo';});
}
