'use strict';

// Ponte arquivo-a-arquivo entre a pílula do navegador (src/pill/pill.cfg.js, roda DENTRO do Camoufox)
// e o Hub (processo do RinoMask) — são programas separados, sem canal direto.
//  - MEMBER_FILE: o hub cria ao encaixar o navegador e apaga ao soltar → a pílula sabe que está no hub
//    (clique esquerdo = destacar; fora do hub o clique esquerdo continua abrindo as cores).
//  - SIGNAL_FILE: a pílula grava ao receber o clique → o hub vê o mtime mudar e destaca o perfil.
// Os dois ficam na pasta do perfil (userDataDir) e só contêm um timestamp.

const fs = require('fs');
const path = require('path');

const MEMBER_FILE = 'rinomask-hub.member';
const SIGNAL_FILE = 'rinomask-hub.signal';

function markMember(dir) {
  try { fs.writeFileSync(path.join(dir, MEMBER_FILE), String(Date.now())); return true; } catch (e) { return false; }
}
function unmarkMember(dir) {
  try { fs.unlinkSync(path.join(dir, MEMBER_FILE)); } catch (e) { /* já não existia */ }
}
// mtime do último clique na pílula (0 = nunca clicou).
function signalTime(dir) {
  try { return fs.statSync(path.join(dir, SIGNAL_FILE)).mtimeMs; } catch (e) { return 0; }
}

module.exports = { markMember, unmarkMember, signalTime, MEMBER_FILE, SIGNAL_FILE };
