'use strict';
// Release em um comando: bump de versão + MANIFEST + commit/push + build do instalador +
// publica a release no GitHub com o .exe anexado. NÃO precisa colar token toda vez.
//
// Token (configure UMA vez, fora do projeto):
//   - variável de ambiente GH_TOKEN (ou GITHUB_TOKEN), OU
//   - arquivo  %USERPROFILE%\.rinomask-release-token  com o token numa linha.
//   O token NUNCA é versionado.
//
// Uso:
//   npm run release            -> patch  (2.1.1 -> 2.1.2)
//   npm run release -- minor   -> minor  (2.1.1 -> 2.2.0)
//   npm run release -- major   -> major  (2.1.1 -> 3.0.0)
//   npm run release -- 2.5.0   -> versão específica

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const OWNER = 'Dennekyy', REPO = 'rinomask';
let TOKEN = '';

const die = (m) => { console.error('\n  ✖ ' + m + '\n'); process.exit(1); };
const step = (m) => console.log('\n▶ ' + m);
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

function getToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  const f = path.join(os.homedir(), '.rinomask-release-token');
  if (fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8').trim(); if (t) return t; }
  die(`Token do GitHub não encontrado. Configure UMA vez:\n` +
    `  1) Crie um token em github.com/settings/tokens (fine-grained) com\n` +
    `     "Contents: Read and write" no repositório ${OWNER}/${REPO}.\n` +
    `  2) Salve em: ${f}\n` +
    `     PowerShell:  Set-Content "$HOME\\.rinomask-release-token" "ghp_seu_token"\n` +
    `  (ou defina a variável de ambiente GH_TOKEN)`);
}

function bump(cur, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [a, b, c] = cur.split('.').map(Number);
  if (kind === 'major') return `${a + 1}.0.0`;
  if (kind === 'minor') return `${a}.${b + 1}.0`;
  if (kind === 'patch') return `${a}.${b}.${c + 1}`;
  die(`Tipo de bump inválido: "${kind}". Use patch | minor | major | X.Y.Z`);
}

function api(method, host, p, headers, body) {
  return new Promise((res, rej) => {
    const req = https.request({ method, host, path: p, headers: { 'User-Agent': 'RinoMask-release', Authorization: 'token ' + TOKEN, ...headers } },
      (r) => { const d = []; r.on('data', (c) => d.push(c)); r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(d) })); });
    req.on('error', rej); if (body) req.write(body); req.end();
  });
}

(async () => {
  TOKEN = getToken();
  // Valida o token e o acesso ao repo ANTES de mexer em qualquer coisa (não desperdiça build).
  const chk = await api('GET', 'api.github.com', `/repos/${OWNER}/${REPO}`, { Accept: 'application/vnd.github+json' });
  if (chk.status !== 200) die(`Token inválido ou sem acesso a ${OWNER}/${REPO} (HTTP ${chk.status}). Gere um novo com permissão de Contents: write.`);

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const kind = (process.argv[2] || 'patch').trim();
  const newV = bump(pkg.version, kind);
  const tag = 'v' + newV;

  // Já existe essa tag/release?
  const ex = await api('GET', 'api.github.com', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`, { Accept: 'application/vnd.github+json' });
  if (ex.status === 200) die(`A release ${tag} já existe. Use outro número de versão.`);

  step(`Versão ${pkg.version} -> ${newV}`);
  pkg.version = newV;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  step('Atualizando MANIFEST.sha256');
  run('node scripts/make-manifest.js');

  step('Commit + push (usa a credencial do git já em cache)');
  run('git add -A');
  run(`git commit -q -m "Versão ${newV}"`);
  run('git push origin main');

  step('Empacotando o instalador (electron-builder) — pode levar alguns minutos');
  run('npm run dist');
  const exeName = `RinoMask Setup ${newV}.exe`;
  const exe = path.join(root, 'dist', exeName);
  if (!fs.existsSync(exe)) die('Instalador não encontrado em dist/: ' + exeName);

  step('Copiando o instalador para ../release/');
  const relDir = path.join(root, '..', 'release');
  fs.mkdirSync(relDir, { recursive: true });
  for (const f of fs.readdirSync(relDir)) if (f.endsWith('.exe')) fs.rmSync(path.join(relDir, f));
  fs.copyFileSync(exe, path.join(relDir, exeName));

  step('Publicando a release no GitHub e anexando o instalador');
  const rb = JSON.stringify({ tag_name: tag, name: 'RinoMask ' + newV, draft: false, prerelease: false,
    body: `Release ${newV}.\n\nBaixe o RinoMask-Setup-${newV}.exe e execute. Não é assinado (SmartScreen: Mais informações -> Executar assim mesmo). Na 1ª abertura o app baixa o motor Camoufox (~530 MB).` });
  const cr = await api('POST', 'api.github.com', `/repos/${OWNER}/${REPO}/releases`, { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(rb) }, rb);
  const rel = JSON.parse(cr.body.toString());
  if (!rel.id) die('Falha ao criar a release: HTTP ' + cr.status + ' ' + (rel.message || ''));

  const data = fs.readFileSync(exe);
  const assetName = `RinoMask-Setup-${newV}.exe`;
  const up = await api('POST', 'uploads.github.com', `/repos/${OWNER}/${REPO}/releases/${rel.id}/assets?name=${assetName}`,
    { 'Content-Type': 'application/octet-stream', 'Content-Length': data.length }, data);
  const a = JSON.parse(up.body.toString());
  if (up.status !== 201) die('Falha no upload do instalador: HTTP ' + up.status + ' ' + (a.message || ''));

  console.log(`\n  ✔ Release ${tag} publicada: ${rel.html_url}`);
  console.log(`  ✔ Instalador: ${a.browser_download_url}`);
  console.log(`  ✔ Os apps em versões anteriores verão o aviso de atualização (após o cache da raw, ~5 min).\n`);
})().catch((e) => die(e && e.message || String(e)));
