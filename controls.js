export function purId(text) {
  const ids = [...new Set(Array.from(String(text || '').replaceAll('_', ' ').matchAll(/\bPUR[\s_.:#º°()/-]*(?:n[º°.]?\s*)?(\d{3,6})\b/gi), match => match[1]))];
  if (ids.length > 1) throw Error('Há números de PUR conflitantes no documento: ' + ids.join(', '));
  return ids[0] || '';
}

/* O texto do PUR cita outros números (outros projetos, protocolos, leituras coladas do OCR).
 * O PUR do contrato vem do nome do arquivo; senão, do texto: o número do financeiro, se citado, ou o único número citado.
 * Os demais voltam em `others`, para virar confirmação, e nunca bloqueiam sozinhos. */
export function contractPur(fileName, text, financial) {
  const named = purId(fileName);
  const cited = [...new Set(Array.from(String(text || '').replaceAll('_', ' ').matchAll(/\bPUR[\s_.:#º°()/-]*(?:n[º°.]?\s*)?(\d{3,6})\b/gi), m => m[1]))];
  const id = named || (financial && cited.includes(financial) ? financial : cited.length === 1 ? cited[0] : '');
  return {id, others: cited.filter(x => x !== id)};
}

export function checkIdentity(fin, contract, manual, evidence) {
  if (fin && contract && fin !== contract) throw Error('Projetos diferentes: financeiro PUR ' + fin + ' e contrato PUR ' + contract + '.');
  if (!fin || !contract) {
    if (!/^\d{3,6}$/.test(manual) || !evidence.trim()) throw Error('Informe o PUR conferido e a célula ou página que comprova a identificação ausente.');
    if ((fin || contract) && manual !== (fin || contract)) throw Error('O PUR conferido diverge do documento identificado.');
  }
  return {financeiro: fin || manual, contrato: contract || manual, manual: !fin || !contract, fonteManual: evidence.trim()};
}

export function checkClosing(realized, closing) {
  if (!realized.includes(closing)) throw Error('Fechamento bloqueado: competência sem marcação Realizado na Posição Financeira.');
}

