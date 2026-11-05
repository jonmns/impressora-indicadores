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

- `tests.html`: testes no navegador (70 verificações). Inclui OCR real com o Tesseract de `vendor/`: um quadro desenhado em canvas, com células apagadas da leitura para exercitar `fillGaps`.
- `dev/run-tests.js` ou `dev/run_tests.py`: rodam `tests.html` no Chromium via Playwright. Uso: `python dev/run_tests.py http://127.0.0.1:8931`.
- `dev/make_fixtures.py` e `dev/make_scan.py`: geram PDFs e planilha sintéticos. Dependências: pillow, playwright, reportlab, openpyxl.
- `dev/run.js` ou `dev/run.py`: fluxo completo com PDFs de texto.
- `dev/ocr.js` ou `dev/ocr.py`: fluxo completo com PDF digitalizado sintético. `ocr.py` aceita o nome do PDF (`python dev/ocr.py URL PASTA PUR_scan_270.pdf`) e reprova se houver valor errado sem aviso na rubrica.
- `dev/dbg.js` ou `dev/dbg.py`: despeja o texto do OCR por página.

As versões em Python servem para máquinas sem Node. Antes de rodar `dev/`, instale as dependências (`python -m pip install pillow playwright reportlab openpyxl` e `python -m playwright install chromium`) e gere as fixtures em uma pasta fora do versionamento. Se outra sessão já usa a porta 8931, sirva em outra porta com `--directory` apontando para a sua cópia: o servidor de outra pasta responde com o código errado sem avisar.

Resultado atual de `dev/ocr.py` (corretos / errados / faltando / errados sem aviso):

| PDF | Caso | Resultado |
|---|---|---|
| `Adendo_scan.pdf` | adendo DE/PARA, quadro girado 90° | 105 / 0 / 0 / 0 |
| `PUR_scan.pdf` | PUR sem adendo | 84 / 0 / 0 / 0 |
| `PUR_scan_270.pdf` | quadro girado 270° | 97 / 0 / 1 / 0 |
| `PUR_scan_ruim.pdf` | 2x, inclinado 1,3°, pouco contraste, ruído, JPEG 45 | 16 / 11 / 43 / 0 |
| `PUR_scan_pessimo.pdf` | como o ruim, com 1,6x e JPEG 35 | 1 / 9 / 60 / 0 |

## Fluxo do PUR em PDF

`app.js` chama `readPurPdf` em `pur-v2.js`:

1. `pdfPages` lê a camada de texto (`pur-pdf.js`).
2. Sem cabeçalho "Mês N", `rotatedPages` tenta texto vertical.
3. Ainda sem cabeçalho, `textlessPages` acha as páginas sem texto útil e `ocrPages` faz o OCR (`pur-ocr.js`).
4. `filterCurrent` isola os quadros PARA de adendos. Adendo sem PARA identificável é bloqueado de propósito.
5. `parsePur` monta valores, totais e `moneyMonths`.
6. A duração vem do quadro financeiro (`moneyMonths`), porque cronograma físico e vigência podem ser maiores que a execução.
7. Com OCR, `reviewOcr` compara cada rubrica com a coluna de total (`reconcile`) e avisa: total que parece lido errado, valor corrigido pela soma, células sem leitura que viraram zero (quantas e onde) e rubrica que não fecha.
8. `checkSubtotals` confere cada mês contra a linha Sub-Total, somando as sete rubricas e as que não vão para o relatório (livros, viagens, treinamento, lidas por `parsePur` em `others`). Divergência vira aviso; nenhum valor é alterado.

Detalhes do OCR em `pur-ocr.js`: passada rápida (escala 3) em todas as páginas, releitura (escala 5) dos quadros mensais, correção de inclinação em `skewAngle`, contraste esticado e remoção das linhas de grade em `clean`, títulos soltos (De/Para) recuperados por leitura esparsa em `addTitles`, supressão do carimbo de assinatura com `ctx.fillText=()=>{}`, releitura de células vazias em `fillGaps`, cabeçalho reconstruído em `repairHeader`. A renderização usa `intent:'print'` para não depender de animation frame com a janela fora de vista.

## Causas já resolvidas

- `Cannot perform Construct on a detached ArrayBuffer`: o pdf.js desanexa o buffer ao transferi-lo para o worker. Sempre passe uma cópia.
- PDF assinado no Certisign vira imagem. A única camada de texto é o carimbo, repetido em todas as páginas.
- O cabeçalho dos quadros sumia no OCR por causa das linhas de grade.
- A leitura em bloco (psm 6) às vezes descarta o título "Para:" acima do quadro, e o adendo era bloqueado. `addTitles` resolve.
- Em PDF de duas páginas, o carimbo não chegava ao mínimo de repetições e a página digitalizada não ia para o OCR.
- Palavra solta de linha quebrada ("de", "Quadro de", "anterior.", "proposta.") virava marcador DE/PARA. Agora, sem dois-pontos, o marcador precisa estar em maiúsculas ou começar com maiúscula.
- Linha de total de quadro de desembolso ou por etapa era tomada como Sub-Total. Agora só conta em quadro com pelo menos três rubricas.
- "DE" de fragmento do OCR numa tabela de RH bloqueava o documento como "DE sem PARA". Sem PARA, o DE só conta se vier antes de um quadro de meses com rubricas.
- "Sub-T otal" (letras separadas no PDF) não era reconhecido como total, e a conferência acusava divergência falsa em todos os meses.
- O OCR era pulado quando só o cronograma físico tinha cabeçalho de meses em texto e o quadro financeiro era imagem. Agora o OCR roda sempre que não há quadro financeiro legível.
- `fillGaps` ampliava o recorte 2x fixo; com letra maior, os dígitos ficavam altos demais para o Tesseract. Agora mira uns 32 px.

## Pendências

### Uso real

1. **Validar pelo botão.** O PUR real foi testado por script na aba, chamando os módulos. Falta o fluxo completo na tela: Extrair, conferir, gerar o `.xlsx` e abrir o arquivo. O usuário precisa fornecer os arquivos localmente.
2. **Horas e profissionais previstos.** O PDF testado não tem quadro mensal reconhecido e 60 campos ficam pendentes, o que bloqueia a exportação. Decidir com o usuário: planilha de apoio, preenchimento manual ou derivar dos quadros de RH por etapa.
3. **Conferir os dados realizados e a exportação** com o documento real. Só o planejado foi conferido.

### Confiabilidade do OCR

Itens 4 a 8 resolvidos (avisos de `reviewOcr`, conferência pelo Sub-Total, variantes de digitalização, teste de `fillGaps`). Os números abaixo são de pendências novas:

4. Digitalização ruim ainda lê pouco (`PUR_scan_ruim.pdf`: 16 corretos de 70). Os errados têm aviso, mas o resultado não serve. Caminhos: binarização adaptativa por região, OCR com dígitos maiores na passada fina, ou pedir ao usuário um PDF melhor quando o Sub-Total não fecha.
5. Testar com mais PUR e adendos reais digitalizados. Só um adendo real passou pelo OCR.
7. **Termo Aditivo sem DE/PARA (decidido: ler como PUR completo).** Lido como plano vigente só se o quadro fechar: cada rubrica com total e sem mês sem leitura, soma dos meses igual ao total, e Sub-Total conferido em pelo menos um mês sem divergência (`consolidatedProblem`). Sempre com o aviso "Plano lido de Termo Aditivo sem DE/PARA". Se não fechar, o bloqueio diz o motivo. Na rodada com os PUR reais, cinco passaram a ser lidos; os digitalizados continuam bloqueados porque o OCR deixa diferenças de centavos ou meses sem leitura. Avaliar se uma diferença de poucos centavos com aviso pode ser aceita.
6. `valueColumns` aceita como coluna de valores os traços dos rótulos ("I - uso..."), e `fillGaps` relê essa coluna à toa. Não erra, só gasta tempo.

### Experiência

9. Não há botão para cancelar o OCR. Recarregar a página é o único jeito de parar.
10. Só o núcleo Tesseract SIMD está em `vendor/`. O comportamento em navegador sem SIMD não foi testado.
11. Cronometrar o documento longo na versão atual com a janela em segundo plano. Com a janela visível, levava de 4 a 7 minutos antes da última mudança.

### Manutenção

12. Versionar `dev/` e criar testes de OCR. Avaliar CI.
13. Citar `pur-ocr.js` na seção Arquitetura do `README.md`.
14. Avaliar remover `LEIA-ME-ANTES-DE-ENVIAR.txt`, que descreve uma atualização antiga por upload.
15. `rotatedPages` parece redundante agora que o OCR cobre páginas giradas. Confirmar antes de remover.
