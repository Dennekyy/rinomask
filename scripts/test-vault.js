'use strict';
// Testa o Vault: criptografia em repouso + senha-mestra (ciclo completo).
const path = require('path');
const os = require('os');
const fs = require('fs');
const store = require('../src/store');

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

const tmp = path.join(os.tmpdir(), 'rinomask-vault-' + Date.now());
const SJSON = path.join(tmp, 'store.json');
const SVAULT = path.join(tmp, 'store.vault');

store.setDataDir(tmp);
const SECRET = 'Conta Secreta IG 42';
store.createProfile({ name: SECRET, os: 'Windows' });

console.log('[1] Sem senha: plaintext');
check('store.json existe (plaintext)', fs.existsSync(SJSON));
check('store.json contém o nome em claro', fs.readFileSync(SJSON, 'utf8').includes(SECRET));

console.log('\n[2] Ativar senha-mestra (criptografar)');
check('definir senha', store.setMasterPassword('senha123').ok);
check('store.vault criado', fs.existsSync(SVAULT));
check('store.json removido', !fs.existsSync(SJSON));
check('vault NÃO contém dados em claro', !fs.readFileSync(SVAULT, 'utf8').includes(SECRET));

console.log('\n[3] Reabrir o app (re-init) → trancado');
store.setDataDir(tmp);
check('isLocked = true', store.isLocked());
check('listProfiles vazio enquanto trancado', store.listProfiles().length === 0);

console.log('\n[4] Unlock');
check('senha errada é rejeitada', store.unlock('errada').ok === false);
check('senha certa destranca', store.unlock('senha123').ok === true);
check('perfil recuperado após unlock', store.listProfiles().some((p) => p.name === SECRET));

console.log('\n[5] Trocar senha');
check('trocar senha (123 → 456)', store.changeMasterPassword('senha123', 'nova456').ok);
store.setDataDir(tmp);
check('senha antiga não destranca', store.unlock('senha123').ok === false);
check('senha nova destranca', store.unlock('nova456').ok === true);

console.log('\n[6] Remover criptografia');
check('remover senha-mestra', store.removeMasterPassword('nova456').ok);
check('store.json volta (plaintext)', fs.existsSync(SJSON));
check('store.vault removido', !fs.existsSync(SVAULT));

console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
