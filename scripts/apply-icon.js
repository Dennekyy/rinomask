'use strict';
// Marca o RinoMask.exe empacotado (dist/win-unpacked) com o ícone real do app.
// signAndEditExecutable:false (package.json) faz o electron-builder pular essa etapa
// inteira para evitar baixar o winCodeSign (cuja extração precisa de privilégio de symlink
// que esta conta não tem) — o efeito colateral era o exe ficar com o ícone padrão do
// Electron. Usamos o mesmo rcedit já buscado no postinstall (ver scripts/fetch-rcedit.js),
// do mesmo jeito que src/branding.js já faz para o camoufox.exe.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const exe = path.join(root, 'dist', 'win-unpacked', `${pkg.productName}.exe`);
const rcedit = path.join(root, 'build', 'rcedit-x64.exe');
const icon = path.join(root, 'build', 'icon.ico');

for (const [label, p] of [['exe', exe], ['rcedit', rcedit], ['icon', icon]]) {
  if (!fs.existsSync(p)) { console.error(`apply-icon: ${label} não encontrado em ${p}`); process.exit(1); }
}

execFileSync(rcedit, [
  exe,
  '--set-icon', icon,
  '--set-version-string', 'ProductName', pkg.productName,
  '--set-version-string', 'FileDescription', pkg.productName,
  '--set-version-string', 'CompanyName', pkg.productName,
  '--set-version-string', 'InternalName', pkg.productName,
], { stdio: 'inherit' });

console.log(`apply-icon: ícone do RinoMask aplicado em ${exe}`);
