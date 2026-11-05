import assert from 'node:assert/strict';
import {purId, checkIdentity, checkClosing} from './controls.js';
import {month} from './engine.js';

assert.throws(() => checkIdentity(purId('Fin_PUR_589_IKT'), purId('23ºTA_PUR586_IKT'), '', ''), /Projetos diferentes/);
assert.equal(checkIdentity('589','589','','').financeiro,'589');
assert.throws(() => checkIdentity('589','','589',''), /página/);
assert.equal(checkIdentity('589','','589','Contrato, p. 1').manual,true);
assert.throws(() => purId('PUR 589, PUR 586'), /conflitantes/);
assert.throws(() => checkClosing([month('2026-08')],month('2026-09')), /bloqueado/);
checkClosing([month('2026-09')],month('2026-09'));
assert.equal(month('2026-13'),null);
console.log('8 verificações aprovadas.');
