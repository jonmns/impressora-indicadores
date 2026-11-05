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

- `tests.html`: testes no navegador (87 verificações). Inclui OCR real com o Tesseract de `vendor/`: um quadro desenhado em canvas, com células apagadas da leitura para exercitar `fillGaps`.
- `dev/run-tests.js` ou `dev/run_tests.py`: (também rodam no CI, `.github/workflows/tests.yml`) rodam `tests.html` no Chromium via Playwright. Uso: `python dev/run_tests.py http://127.0.0.1:8931`.
- `dev/make_fixtures.py` e `dev/make_scan.py`: geram PDFs e planilha sintéticos. Dependências: pillow, playwright, reportlab, openpyxl.
- `dev/run.js` ou `dev/run.py`: fluxo completo com PDFs de texto.
- `dev/ocr.js` ou `dev/ocr.py`: fluxo completo com PDF digitalizado sintético. `ocr.py` aceita o nome do PDF (`python dev/ocr.py URL PASTA PUR_scan_270.pdf`) e reprova se houver valor errado sem aviso na rubrica.
- `dev/dbg.js` ou `dev/dbg.py`: despeja o texto do OCR por página.
- `dev/flow_real.py`, `dev/ui_real.py`, `dev/check_real.py` (Playwright Python e openpyxl): fluxo pela tela com documentos reais e conferência do `.xlsx` contra a planilha financeira. Passe os caminhos por argumento e grave a saída fora do repositório.

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
5. `parsePur` monta valores, totais e `moneyMonths`. `rhTotals` (`pur-rh.js`) lê as horas de RH do detalhamento financeiro nas páginas sem filtro.
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

1. **Validar pelo botão.** Feito com `dev/flow_real.py` num lote de 14 projetos reais (os documentos ficam fora do repositório). 4 projetos (2 com texto, 2 com OCR) saem sem pendência: Extrair, conferir, gerar o `.xlsx` e abrir no Excel sem reparo. Falhas abertas, todas de leitura do PDF (itens 7 e 16): 1 projeto sem duração; 5 adendos bloqueados por falta de quadro PARA; 2 projetos com R$ planejado e detalhamento de RH ilegíveis após o OCR (ficam pendentes). 1 projeto é bloqueio correto (o fechamento passa do fim do projeto) e 1 não tinha PDF.
2. **Horas e profissionais previstos.** Resolvido. O PUR real não tem quadro mensal de horas; `pur-rh.js` lê o "Detalhamento dos recursos financeiros" (tabelas c) RH Diretos e d) RH Indiretos, PARA em adendo, aceita só se fechar com o TOTAL; uma linha sem valor no OCR é deduzida do TOTAL quando horas × custo/hora confere, com aviso) e `extract` distribui a média das horas totais pelos meses, com o número de cargos como profissionais previstos. Se a leitura falhar, o usuário informa os totais nas abas RHD e RHI da conferência (`spreadPlanned` em `engine.js`). A aba "Profissionais Previstos" da planilha financeira não serve de fonte: está vazia ou com datas erradas.
3. **Conferir realizado e exportação.** Feito com `dev/check_real.py` nos 4 projetos exportados: entre 290 e 668 verificações por projeto; um sem divergência e três só com 1 a 3 centavos no último mês do planejado, porque os meses do próprio PUR somam um pouco acima do total e a planilha ajusta o último mês (o site segue o PDF).

### Confiabilidade do OCR

Itens 4 a 8 resolvidos (avisos de `reviewOcr`, conferência pelo Sub-Total, variantes de digitalização, teste de `fillGaps`). Os números abaixo são de pendências novas:

4. Digitalização ruim ainda lê pouco (`PUR_scan_ruim.pdf`: 16 corretos de 70). Os errados têm aviso, mas o resultado não serve. Caminhos: binarização adaptativa por região, OCR com dígitos maiores na passada fina, ou pedir ao usuário um PDF melhor quando o Sub-Total não fecha.
5. Testar com mais PUR e adendos reais digitalizados. Só um adendo real passou pelo OCR.
7. **Termo Aditivo sem DE/PARA (decidido: ler como PUR completo).** `consolidatedReview`: rubrica que fecha com o total fica como lida (com OCR, diferença de até R$ 0,10 passa com aviso); rubrica sem total, que não fecha ou com mês sem leitura fica pendente inteira, com o valor lido na fonte da célula. Bloqueia só com menos de três rubricas que fecham ou com Sub-Total divergente. Sempre com o aviso "Plano lido de Termo Aditivo sem DE/PARA". Na última rodada com os PUR reais, um digitalizado ainda é bloqueado (só duas rubricas fecham). Melhorar o OCR desse caso fica para um PR seguinte.
6. `valueColumns` aceita como coluna de valores os traços dos rótulos ("I - uso..."), e `fillGaps` relê essa coluna à toa. Não erra, só gasta tempo.

### Experiência

9. ~~Cancelar o OCR~~ Feito: botão "Cancelar leitura" (`AbortController` de `app.js` até `ocrPages`, que encerra os workers e o pdf.js; cancelou em cerca de 1,7 s no teste e permite nova extração).
10. ~~Navegador sem SIMD~~ Feito: sem SIMD o núcleo não carrega, então `ocrPages` checa `hasSimd()` e mostra mensagem clara (atualizar o navegador ou usar PDF com texto). Testado simulando `WebAssembly.validate` falso; não há núcleo não SIMD em `vendor/`.
11. **Adiado**: cronometrar o documento longo, com a janela visível e em segundo plano, uma única vez depois de juntar os branches de OCR. Antes, com a janela visível, levava de 4 a 7 minutos.

### Manutenção

12. ~~Versionar `dev/` e avaliar CI~~ Feito: `dev/` já estava versionado (só scripts; `.gitignore` agora também bloqueia `dev/fixtures/`, `dev/out/`, `__pycache__/` e `*.log`). `.github/workflows/tests.yml` (**ainda não enviado**: o token do push não tem o escopo `workflow`; o arquivo precisa ser commitado por quem tem esse acesso) roda em push e PR, com ações fixadas por SHA e Playwright 1.64.1 / openpyxl 3.1.5: serve a pasta, roda `dev/run_tests.py` (`tests.html`) e `dev/run.py` com PDFs de texto gerados por `dev/make_fixtures.py`, reprovando em erro de tela ou da página. O OCR completo (`dev/ocr.py`) fica fora do CI por ser lento.
13. Citar `pur-ocr.js` na seção Arquitetura do `README.md`.
14. ~~Remover `LEIA-ME-ANTES-DE-ENVIAR.txt`~~ Resolvido: arquivo removido e as observações úteis foram para o `README.md`.
15. ~~`rotatedPages` redundante?~~ Resolvido: **fica**. Testado com PDFs de texto sintéticos (cabeçalho girado 90° e 270°; página inteira girada 90° e 270°), com e sem a função: cabeçalho girado dá o mesmo resultado nos dois casos (12 meses, mesmos valores), mas com a página inteira girada 270° sem `rotatedPages` o documento falha ("Não encontrei a quantidade de meses") e com ela a duração é achada. Custo medido: 0,0 a 0,17 s por PDF de uma página, contra minutos de OCR. Limite conhecido: com a página inteira girada, só o cabeçalho vem da segunda leitura; os valores das rubricas ficam pendentes (e a página girada 90° não acha 12 meses nem com ela). Comentário no código explica.
16. Para PDF de texto, avisar quando a soma dos meses de uma rubrica difere do total do quadro (hoje `reconcile` só roda com OCR).
