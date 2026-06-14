'use strict';
// Baixa o rcedit (electron/rcedit) para build/rcedit-x64.exe. Esse binário de terceiros
// é usado em runtime para marcar o camoufox.exe como "RinoMask" (ícone/nome na barra de
// tarefas). Não é versionado no git — é buscado no postinstall. Best-effort: se falhar,
// o app funciona normal, só sem a marca do navegador.
const fs = require('fs');
const path = require('path');
const https = require('https');

const dest = path.join(__dirname, '..', 'build', 'rcedit-x64.exe');
const URL = 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe';

if (process.platform !== 'win32') { console.log('rcedit: só Windows — ignorando.'); process.exit(0); }
if (fs.existsSync(dest) && fs.statSync(dest).size > 100000) { console.log('rcedit já presente.'); process.exit(0); }

fs.mkdirSync(path.dirname(dest), { recursive: true });
function download(url, redirects = 0) {
  if (redirects > 5) { console.error('rcedit: redirecionamentos demais.'); process.exit(0); }
  https.get(url, { headers: { 'User-Agent': 'rinomask' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { download(res.headers.location, redirects + 1); return; }
    if (res.statusCode !== 200) { console.error('rcedit: HTTP ' + res.statusCode + ' — marca do navegador ficará indisponível.'); process.exit(0); }
    const f = fs.createWriteStream(dest);
    res.pipe(f);
    f.on('finish', () => f.close(() => console.log('rcedit baixado em build/rcedit-x64.exe.')));
    f.on('error', () => process.exit(0));
  }).on('error', (e) => { console.error('rcedit: falha no download —', e.message); process.exit(0); });
}
download(URL);
