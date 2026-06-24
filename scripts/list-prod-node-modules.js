'use strict';
// Gera a lista de "node_modules/<pacote>/**" que deve estar em package.json#build.files.
// O electron-builder rastreia dependencias por conta propria a partir de "dependencies" do
// package.json, mas esse rastreio se provou nao-confiavel (ficou faltando playwright-core,
// mesmo sendo dependencia real de playwright). Em vez de confiar nisso ou incluir
// node_modules/** (que arrastaria ~200 pacotes do proprio toolchain do electron-builder),
// usamos a arvore REAL de dependencias de producao (npm ls --omit=dev) como fonte da verdade.
//
// Uso: depois de adicionar/remover uma dependencia em package.json#dependencies, rode
//   node scripts/list-prod-node-modules.js
// e cole a lista impressa no lugar das linhas "node_modules/.../**" em build.files.
const { execSync } = require('child_process');

const raw = execSync('npm ls --omit=dev --all --json', { cwd: require('path').join(__dirname, '..'), maxBuffer: 1024 * 1024 * 16 }).toString('utf8').replace(/^﻿/, '');
const data = JSON.parse(raw);
const needed = new Set();
function walk(deps) {
  if (!deps) return;
  for (const [name, info] of Object.entries(deps)) { needed.add(name); walk(info.dependencies); }
}
walk(data.dependencies);

console.log([...needed].sort().map((n) => `      "node_modules/${n}/**",`).join('\n'));
console.log(`\n// total: ${needed.size} pacotes`);
