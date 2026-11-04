# Impressora de indicadores gerenciais

Aplicação estática para extrair dados da planilha financeira PPI 4.0 e do PUR (ou último adendo) em PDF, conferir as entradas e gerar indicadores em Excel. Processa documentos no navegador; não possui backend, telemetria nem armazenamento persistente.

## Uso

1. Selecione o financeiro mensal **já calculado e salvo no Excel** (.xlsx/.xlsm).
2. Selecione o **PUR ou último adendo aprovado em PDF** (com texto selecionável). Um .docx também é aceito, só para consulta.
3. Informe o início real, duração (até 24 meses) e último mês fechado. Mês 1 é o primeiro mês do projeto.
4. Confira as fontes, corrija os campos pendentes e valide as contagens de RH.
5. Gere o Excel e, se necessário, baixe a memória JSON com os arquivos, células de origem e ajustes manuais.

Opcionalmente, selecione a planilha de apoio do PUR (.xlsx/.xlsm) para completar o que o PDF não trouxer, e o modelo original de indicadores para preservar o formato. Sem ele, a aplicação gera um modelo equivalente com as mesmas sete rubricas, linhas mensais, acumulados e percentuais. O original e os documentos selecionados não são enviados ao GitHub.

## Compatibilidade e limites

- Financeiro: Posição Financeira, competências na linha 7, situação Realizado na linha 6; rubricas reconhecidas pelo texto e linhas Real. localizadas na coluna L. Não importa meses projetados como realizados.
- PUR em PDF (fonte principal do planejado): o texto é lido com pdf.js e as linhas e colunas são reconstruídas pela posição. São reconhecidas tabelas com cabeçalho mensal (`Mês 1`, `M1`, `1º mês`, `jan/26`, `01/2026` ou inteiros consecutivos). Em tabela de valores, linhas cujo rótulo é uma rubrica viram R$ PUR, inclusive com rótulo quebrado em duas linhas; traço vale zero; colunas de total são ignoradas. Em tabela cujo título ou cabeçalho fala de horas, as linhas de função somam as horas do mês e as funções com horas > 0 viram profissionais previstos, agrupadas em RHD ou RHI pelo título ou pela linha de rubrica. Valor ambíguo (rubrica repetida) mantém o primeiro e gera aviso.
- Planilha de apoio (opcional): cronograma físico-financeiro, Valores previstos Iniciais e seção mensal da aba Plano de trabalho. Só completa campos que o PDF não trouxe; divergências são avisadas e vale o PDF. **Duas vagas com a mesma função exigem ajuste manual**, nas duas fontes.
- PDF digitalizado (imagem) não é lido: não há OCR. PUR com apenas horas totais por função deixa horas e profissionais previstos pendentes.
- RH realizado: reconhece cabeçalhos Data, Nome do Funcionário, CPF e Horas Trabalhadas. Conta pessoas distintas por CPF, usando nome quando o CPF estiver ausente. Soma horas por competência, não por data de pagamento.
- PUR em .docx: texto para consulta, sem extração do planejado.
- Fórmulas de origem não são executadas: resultados salvos ausentes geram pendências. VBA e vínculos externos não são executados.
- Denominador zero conserva #DIV/0! do modelo. Campos pendentes bloqueiam exportação; não são convertidos em zero. Meses futuros ficam sem realizado.
- A seleção do último adendo aprovado e a correspondência entre os projetos dependem da conferência humana. Não há classificador automático de aprovação documental.
- Não produz conclusões automáticas sobre desvio ou ações corretivas do relatório técnico.

## Executar e hospedar

Sirva a pasta com qualquer servidor estático. Exemplo: `python -m http.server 8080`. Não há instalação ou build. No GitHub: Settings → Pages → Deploy from a branch → main → /(root). Abra `tests.html` no servidor para executar os testes com dados sintéticos, incluindo a exportação em 12 e 24 meses e a leitura de um PUR em PDF sintético gerado no próprio teste.

## Arquitetura

`engine.js` lê o pacote OOXML diretamente e mantém fonte por célula; `pur-pdf.js` lê o PUR em PDF e registra página e linha de origem de cada valor; `app.js` controla seleção, conferência e download. A exportação altera entradas e calcula os acumulados no XML do Excel, preservando os demais componentes do modelo selecionado. A extensão até 24 meses copia estilos da última coluna. JSZip 3.x é distribuído no arquivo `jszip.min.js`, com licença MIT/GPL incluída. pdf.js 5.4.296 (build legacy) fica em `vendor/`, com licença Apache-2.0, e só é carregado quando um PDF é selecionado. Nenhuma dependência é buscada em CDN durante o uso.

Documentos financeiros, PUR, modelos privados, arquivos de teste reais e credenciais **não devem ser versionados**.


