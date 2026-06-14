'use strict';

// Marca o executável do Camoufox como "RinoMask" (ícone + nome) para que a barra de tarefas
// mostre a identidade do RinoMask em vez do Camoufox ao abrir um perfil.
// Best-effort e idempotente: qualquer falha é registrada e ignorada (não impede o uso do app).
// Roda só quando NENHUM perfil está aberto (no startup / após baixar o motor) p/ evitar lock.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const buildDir = path.join(__dirname, '..', 'build');
const rceditPath = path.join(buildDir, 'rcedit-x64.exe');
const iconPath = path.join(buildDir, 'icon.ico');

async function enginePath() {
  try { const pk = await import('camoufox-js/dist/pkgman.js'); return pk.launchPath(); } catch (e) { return null; }
}
function run(exe, args) {
  return new Promise((resolve) => execFile(exe, args, { windowsHide: true }, (err) => resolve(!err)));
}

async function applyBranding(log) {
  if (process.platform !== 'win32') return { ok: false, skipped: 'plataforma' };
  const exe = await enginePath();
  if (!exe || !fs.existsSync(exe) || !fs.existsSync(rceditPath) || !fs.existsSync(iconPath)) return { ok: false, skipped: 'arquivos ausentes' };
  const marker = path.join(path.dirname(exe), '.rinomask-branded'); // 1x por instalação do motor (sumiu = motor rebaixado/rebaixado → reaplica)
  try { if (fs.existsSync(marker)) return { ok: true, already: true }; } catch (e) {}
  const ok = await run(rceditPath, [
    exe,
    '--set-icon', iconPath,
    '--set-version-string', 'ProductName', 'RinoMask',
    '--set-version-string', 'FileDescription', 'RinoMask',
    '--set-version-string', 'CompanyName', 'RinoMask',
    '--set-version-string', 'InternalName', 'RinoMask',
  ]);
  if (ok) { try { fs.writeFileSync(marker, new Date().toISOString()); } catch (e) {} return { ok: true }; }
  if (log) log({ source: 'branding', message: 'rcedit não conseguiu marcar o camoufox.exe (talvez esteja aberto)' });
  return { ok: false };
}

module.exports = { applyBranding };
