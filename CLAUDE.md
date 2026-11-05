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

- `tests.html`: testes no navegador (63 verificações).
- `dev/run-tests.js`: roda `tests.html` no Chromium via Playwright. Uso: `node dev/run-tests.js http://127.0.0.1:8931`.
- `dev/make_fixtures.py` e `dev/make_scan.py`: geram PDFs e planilha sintéticos. Dependências: pillow, playwright, reportlab, openpyxl.
- `dev/run.js`: fluxo completo com PDFs de texto.
- `dev/ocr.js`: fluxo completo com PDF digitalizado sintético, comparando com `scan_truth.json`. Resultado atual: 105 corretos, 0 errados, 0 faltando.
- `dev/dbg.js`: despeja o texto do OCR por página.
- `dev/flow_real.py`, `dev/ui_real.py`, `dev/check_real.py` (Playwright Python e openpyxl): fluxo pela tela com documentos reais e conferência do `.xlsx` contra a planilha financeira. Passe os caminhos por argumento e grave a saída fora do repositório.

Antes de rodar `dev/`, instale `playwright` e gere as fixtures em uma pasta fora do versionamento.

## Fluxo do PUR em PDF

`app.js` chama `readPurPdf` em `pur-v2.js`:

1. `pdfPages` lê a camada de texto (`pur-pdf.js`).
2. Sem cabeçalho "Mês N", `rotatedPages` tenta texto vertical.
3. Ainda sem cabeçalho, `textlessPages` acha as páginas sem texto útil e `ocrPages` faz o OCR (`pur-ocr.js`).
4. `filterCurrent` isola os quadros PARA de adendos. Adendo sem PARA identificável é bloqueado de propósito.
5. `parsePur` monta valores, totais e `moneyMonths`. `rhTotals` (`pur-rh.js`) lê as horas de RH do detalhamento financeiro nas páginas sem filtro.
6. A duração vem do quadro financeiro (`moneyMonths`), porque cronograma físico e vigência podem ser maiores que a execução.
7. Com OCR, `reconcile` compara cada rubrica com a coluna de total.

Detalhes do OCR em `pur-ocr.js`: passada rápida (escala 3) em todas as páginas, releitura (escala 5) dos quadros mensais, remoção das linhas de grade em `clean`, supressão do carimbo de assinatura com `ctx.fillText=()=>{}`, releitura de células vazias em `fillGaps`, cabeçalho reconstruído em `repairHeader`. A renderização usa `intent:'print'` para não depender de animation frame com a janela fora de vista.

## Causas já resolvidas

- `Cannot perform Construct on a detached ArrayBuffer`: o pdf.js desanexa o buffer ao transferi-lo para o worker. Sempre passe uma cópia.
- PDF assinado no Certisign vira imagem. A única camada de texto é o carimbo, repetido em todas as páginas.
- O cabeçalho dos quadros sumia no OCR por causa das linhas de grade.

## Pendências

### Uso real

1. **Validar pelo botão.** Feito. Com `dev/flow_real.py` nos 14 projetos de 09/2026, JIGX, Hermes (texto), Avanti e Agillia (OCR) saem sem pendência: Extrair, conferir, gerar o `.xlsx` e abrir no Excel sem reparo. Falhas abertas, todas de leitura do PDF (itens 7 e 16): Mercurius sem duração; Storm, Zapy, MAWE MIRI, Dominia e ShinQ bloqueados por falta de quadro PARA; Zeus e Aegis com R$ planejado e detalhamento de RH ilegíveis após o OCR (ficam pendentes). Aurora é bloqueio correto: o fechamento 09/2026 passa do fim do projeto (07/2026). Prioris não tem PDF na pasta.
2. **Horas e profissionais previstos.** Resolvido. O PUR real não tem quadro mensal de horas; `pur-rh.js` lê o "Detalhamento dos recursos financeiros" (tabelas c) RH Diretos e d) RH Indiretos, PARA em adendo, aceita só se fechar com o TOTAL; uma linha sem valor no OCR é deduzida do TOTAL quando horas × custo/hora confere, com aviso) e `extract` distribui a média das horas totais pelos meses, com o número de cargos como profissionais previstos. Se a leitura falhar, o usuário informa os totais nas abas RHD e RHI da conferência (`spreadPlanned` em `engine.js`). A aba "Profissionais Previstos" da planilha financeira não serve de fonte: está vazia ou com datas erradas.
3. **Conferir realizado e exportação.** Feito com `dev/check_real.py`: JIGX 668 verificações sem divergência; Hermes (308), Avanti (290) e Agillia (579) só com 1 a 3 centavos no último mês do planejado, porque os meses do próprio PUR somam um pouco acima do total e a planilha ajusta o último mês (o site segue o PDF).

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
16. Para PDF de texto, avisar quando a soma dos meses de uma rubrica difere do total do quadro (hoje `reconcile` só roda com OCR).
