'use strict';

/*
 * Garante que o binario do Electron esteja extraido.
 *
 * Em Node muito recente (>= 24/26), o extract-zip embutido no Electron pode falhar
 * SILENCIOSAMENTE ao descompactar o binario (o postinstall sai com 0, mas o
 * node_modules/electron/dist fica incompleto, sem electron.exe). Este script detecta
 * isso e extrai o .zip ja baixado no cache do @electron/get usando o `tar` do sistema
 * (bsdtar/libarchive le .zip nativamente) ou `unzip` como alternativa.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const root = path.join(__dirname, '..');
const electronDir = path.join(root, 'node_modules', 'electron');

function exeName() {
  return process.platform === 'win32' ? 'electron.exe'
    : process.platform === 'darwin' ? path.join('Electron.app', 'Contents', 'MacOS', 'Electron')
    : 'electron';
}
function distExe() { return path.join(electronDir, 'dist', exeName()); }

function isOk() {
  try { return fs.existsSync(distExe()); } catch (e) { return false; }
}

function pkgVersion() {
  return require(path.join(electronDir, 'package.json')).version;
}

function cacheRoot() {
  if (process.env.electron_config_cache) return process.env.electron_config_cache;
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron', 'Cache');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'electron');
  return path.join(os.homedir(), '.cache', 'electron');
}

function findZip(dir, name) {
  let found = null;
  const walk = (d) => {
    if (found) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === name) { found = full; return; }
    }
  };
  walk(dir);
  return found;
}

function extract(zip, dest) {
  fs.mkdirSync(dest, { recursive: true });
  // 1) tar do sistema (no Windows e macOS e bsdtar/libarchive, que le .zip)
  try {
    cp.execFileSync('tar', ['-xf', zip, '-C', dest], { stdio: 'ignore' });
    if (fs.existsSync(distExe())) return true;
  } catch (e) { /* tenta proxima opcao */ }
  // 2) unzip (Linux/macOS)
  try {
    cp.execFileSync('unzip', ['-o', zip, '-d', dest], { stdio: 'ignore' });
    if (fs.existsSync(distExe())) return true;
  } catch (e) { /* sem sorte */ }
  return false;
}

function main() {
  if (isOk()) {
    console.log('[setup-electron] Electron ja esta extraido. OK.');
    return;
  }
  const version = pkgVersion();
  const platform = process.env.npm_config_platform || process.platform;
  const arch = process.env.npm_config_arch || process.arch;
  const zipName = `electron-v${version}-${platform}-${arch}.zip`;
  const zip = findZip(cacheRoot(), zipName);

  if (!zip) {
    console.warn(`[setup-electron] Binario do Electron ausente e zip nao encontrado no cache (${zipName}).`);
    console.warn('[setup-electron] Rode: node node_modules/electron/install.js  ou reinstale com rede disponivel.');
    return;
  }

  console.log(`[setup-electron] Extraindo ${zipName} (contornando extract-zip)...`);
  const dest = path.join(electronDir, 'dist');
  fs.rmSync(dest, { recursive: true, force: true });
  if (extract(zip, dest)) {
    fs.writeFileSync(path.join(electronDir, 'path.txt'), exeName());
    console.log('[setup-electron] Electron extraido com sucesso.');
  } else {
    console.warn('[setup-electron] Falha ao extrair com tar/unzip. Extraia manualmente:');
    console.warn(`  tar -xf "${zip}" -C "${dest}"`);
  }
}

main();
