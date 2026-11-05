# Impressora de indicadores

Aplicação estática (GitHub Pages) que lê a planilha financeira PPI 4.0 e o PUR ou adendo em PDF, mostra a conferência e gera o Excel de indicadores. Sem backend e sem build. Todo o processamento fica no navegador.

Site: https://jonmns.github.io/impressora-indicadores/
Repositório: https://github.com/jonmns/impressora-indicadores

## Regras

- Publicar na `main` publica o site. Prefira branch e PR.
- Nunca versione PUR, planilhas ou dados reais. O repositório é público e o `.gitignore` já bloqueia `*.pdf`, `*.xlsx`, `*.xlsm` e `*.docx`.
- Nenhuma dependência vem de CDN durante o uso. Bibliotecas ficam em `vendor/`.
- O documento não sai da máquina do usuário.
- Em dúvida entre valor errado e campo pendente, deixe pendente. Valor de OCR nunca passa sem aviso.
- Responda em português, em prosa direta.

## Como testar

Sirva a pasta com `python -m http.server 8931`. Não abra `index.html` por `file://`.

- `tests.html`: testes no navegador (53 verificações em 9e9ccda).
- `dev/run-tests.js`: roda `tests.html` no Chromium via Playwright. Uso: `node dev/run-tests.js http://127.0.0.1:8931`.
- `dev/make_fixtures.py` e `dev/make_scan.py`: geram PDFs e planilha sintéticos. Dependências: pillow, playwright, reportlab, openpyxl.
- `dev/run.js`: fluxo completo com PDFs de texto.
- `dev/ocr.js`: fluxo completo com PDF digitalizado sintético, comparando com `scan_truth.json`. Resultado atual: 105 corretos, 0 errados, 0 faltando.
- `dev/dbg.js`: despeja o texto do OCR por página.

Antes de rodar `dev/`, instale `playwright` e gere as fixtures em uma pasta fora do versionamento.

## Fluxo do PUR em PDF

`app.js` chama `readPurPdf` em `pur-v2.js`:

1. `pdfPages` lê a camada de texto (`pur-pdf.js`).
2. Sem cabeçalho "Mês N", `rotatedPages` tenta texto vertical.
3. Ainda sem cabeçalho, `textlessPages` acha as páginas sem texto útil e `ocrPages` faz o OCR (`pur-ocr.js`).
4. `filterCurrent` isola os quadros PARA de adendos. Adendo sem PARA identificável é bloqueado de propósito.
5. `parsePur` monta valores, totais e `moneyMonths`.
6. A duração vem do quadro financeiro (`moneyMonths`), porque cronograma físico e vigência podem ser maiores que a execução.
7. Com OCR, `reconcile` compara cada rubrica com a coluna de total.

Detalhes do OCR em `pur-ocr.js`: passada rápida (escala 3) em todas as páginas, releitura (escala 5) dos quadros mensais, remoção das linhas de grade em `clean`, supressão do carimbo de assinatura com `ctx.fillText=()=>{}`, releitura de células vazias em `fillGaps`, cabeçalho reconstruído em `repairHeader`. A renderização usa `intent:'print'` para não depender de animation frame com a janela fora de vista.

## Causas já resolvidas

- `Cannot perform Construct on a detached ArrayBuffer`: o pdf.js desanexa o buffer ao transferi-lo para o worker. Sempre passe uma cópia.
- PDF assinado no Certisign vira imagem. A única camada de texto é o carimbo, repetido em todas as páginas.
- O cabeçalho dos quadros sumia no OCR por causa das linhas de grade.

## Pendências

### Uso real

1. **Validar pelo botão.** O PUR real foi testado por script na aba, chamando os módulos. Falta o fluxo completo na tela: Extrair, conferir, gerar o `.xlsx` e abrir o arquivo. O usuário precisa fornecer os arquivos localmente.
2. **Horas e profissionais previstos.** O PDF testado não tem quadro mensal reconhecido e 60 campos ficam pendentes, o que bloqueia a exportação. Decidir com o usuário: planilha de apoio, preenchimento manual ou derivar dos quadros de RH por etapa.
3. **Conferir os dados realizados e a exportação** com o documento real. Só o planejado foi conferido.

### Confiabilidade do OCR

4. `reconcile` devolve `totalMisread` sem gerar aviso. Deve avisar.
5. Células sem leitura viram zero quando a soma confere. Isso aparece na fonte da célula, sem aviso geral.
6. Falta conferir cada mês contra a linha Sub-Total. Hoje só as linhas são conferidas. Exige ler também as rubricas fora das sete categorias (livros, viagens, treinamento).
7. O OCR só foi testado com um adendo real. Faltam PUR sem adendo, digitalização de pior qualidade e página girada 270°.
8. `dev/ocr.js` não simula células perdidas pelo OCR, então `fillGaps` só foi exercitado no documento real.

### Experiência

9. Não há botão para cancelar o OCR. Recarregar a página é o único jeito de parar.
10. Só o núcleo Tesseract SIMD está em `vendor/`. O comportamento em navegador sem SIMD não foi testado.
11. Cronometrar o documento longo na versão atual com a janela em segundo plano. Com a janela visível, levava de 4 a 7 minutos antes da última mudança.

### Manutenção

12. Versionar `dev/` e criar testes de OCR. Avaliar CI.
13. Citar `pur-ocr.js` na seção Arquitetura do `README.md`.
14. Avaliar remover `LEIA-ME-ANTES-DE-ENVIAR.txt`, que descreve uma atualização antiga por upload.
15. `rotatedPages` parece redundante agora que o OCR cobre páginas giradas. Confirmar antes de remover.
