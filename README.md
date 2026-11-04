# Impressora de indicadores gerenciais

Aplicação estática para extrair dados de planilhas financeiras PPI 4.0 e de planilhas de apoio do PUR, conferir as entradas e gerar indicadores em Excel. Processa documentos no navegador; não possui backend, telemetria nem armazenamento persistente.

## Uso

1. Selecione o financeiro mensal **já calculado e salvo no Excel** (.xlsx/.xlsm).
2. Selecione a planilha de apoio do PUR ou último adendo aprovado (.xlsx/.xlsm).
3. Informe o início real, duração (até 24 meses) e último mês fechado. Mês 1 é o primeiro mês do projeto.
4. Confira as fontes, corrija os campos pendentes e valide as contagens de RH.
5. Gere o Excel e, se necessário, baixe a memória JSON com os arquivos, células de origem e ajustes manuais.

Opcionalmente, selecione o modelo original de indicadores para preservar o formato. Sem ele, a aplicação gera um modelo equivalente com as mesmas sete rubricas, linhas mensais, acumulados e percentuais. O original e os documentos selecionados não são enviados ao GitHub.

## Compatibilidade e limites

- Financeiro: Posição Financeira, competências na linha 7, situação Realizado na linha 6; rubricas reconhecidas pelo texto e linhas Real. localizadas na coluna L. Não importa meses projetados como realizados.
- Plano: cronograma físico-financeiro mensal ou Valores previstos Iniciais. Não usa automaticamente o financeiro como planejado, evitando um baseline desatualizado.
- RH planejado: seção mensal da aba Plano de trabalho da planilha de apoio. Soma horas por mês; profissionais previstos são funções distintas com horas positivas. **Duas vagas com a mesma função exigem ajuste manual.**
- RH realizado: reconhece cabeçalhos Data, Nome do Funcionário, CPF e Horas Trabalhadas. Conta pessoas distintas por CPF, usando nome quando o CPF estiver ausente. Soma horas por competência, não por data de pagamento.
- DOCX complementar: texto para consulta. Não infere cronograma mensal de horas totais. PDF e OCR ainda não implementados.
- Fórmulas de origem não são executadas: resultados salvos ausentes geram pendências. VBA e vínculos externos não são executados.
- Denominador zero conserva #DIV/0! do modelo. Campos pendentes bloqueiam exportação; não são convertidos em zero. Meses futuros ficam sem realizado.
- A seleção do último adendo aprovado e a correspondência entre os projetos dependem da conferência humana. Não há classificador automático de aprovação documental.
- Não produz conclusões automáticas sobre desvio ou ações corretivas do relatório técnico.

## Executar e hospedar

Sirva a pasta com qualquer servidor estático. Exemplo: `python -m http.server 8080`. Não há instalação ou build. No GitHub: Settings → Pages → Deploy from a branch → main → /(root). Abra `tests.html` no servidor para executar os testes com dados sintéticos, incluindo a exportação em 12 e 24 meses.

## Arquitetura

`engine.js` lê o pacote OOXML diretamente e mantém fonte por célula; `app.js` controla seleção, conferência e download. A exportação altera entradas e calcula os acumulados no XML do Excel, preservando os demais componentes do modelo selecionado. A extensão até 24 meses copia estilos da última coluna. JSZip 3.x é distribuído no arquivo `jszip.min.js`, com licença MIT/GPL incluída. Nenhuma dependência é buscada em CDN durante o uso.

Documentos financeiros, PUR, modelos privados, arquivos de teste reais e credenciais **não devem ser versionados**.


