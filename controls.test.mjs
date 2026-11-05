import assert from 'node:assert/strict';
import {purId, contractPur, checkIdentity, checkClosing} from './controls.js';
import {month} from './engine.js';

assert.throws(() => checkIdentity(purId('Fin_PUR_589_IKT'), purId('23ºTA_PUR586_IKT'), '', ''), /Projetos diferentes/);
assert.equal(checkIdentity('589','589','','').financeiro,'589');
assert.throws(() => checkIdentity('589','','589',''), /página/);
assert.equal(checkIdentity('589','','589','Contrato, p. 1').manual,true);
assert.throws(() => purId('PUR 589, PUR 586'), /conflitantes/);
assert.throws(() => checkClosing([month('2026-08')],month('2026-09')), /bloqueado/);
checkClosing([month('2026-09')],month('2026-09'));
assert.equal(month('2026-13'),null);
// O texto do PUR cita outros números: o do financeiro prevalece e os demais viram confirmação.
const texto = 'Plano de Trabalho PUR 517. Ref. PUR517720 do protocolo. Projeto anterior: PUR nº 406.';
assert.deepEqual(contractPur('Adendo.pdf', texto, '517'), {id: '517', others: ['517720', '406']});
assert.equal(contractPur('Adendo_PUR_517.pdf', texto, '').id, '517');
assert.deepEqual(contractPur('Adendo.pdf', texto, ''), {id: '', others: ['517', '517720', '406']});
assert.deepEqual(contractPur('Adendo.pdf', 'Somente PUR 589.', ''), {id: '589', others: []});
assert.deepEqual(contractPur('Adendo.pdf', 'Sem número.', '589'), {id: '', others: []});
console.log('13 verificações aprovadas.');
