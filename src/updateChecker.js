'use strict';

// Verifica se há versão mais nova no GitHub comparando a versão local com a do
// package.json publicado no repositório (branch main). Repo público → não precisa de
// token embutido no app. Quando a versão do git sobe, o app instalado avisa.

const https = require('https');

const OWNER = 'Dennekyy';
const REPO = 'rinomask';
const PKG_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/package.json`;
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases`;

function fetchJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('redirecionamentos demais'));
    https.get(url, { headers: { 'User-Agent': 'RinoMask', 'Cache-Control': 'no-cache' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { fetchJson(res.headers.location, redirects + 1).then(resolve, reject); return; }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

// Compara duas versões semânticas (x.y.z). >0 se a>b.
function cmp(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) > (pb[i] || 0)) return 1; if ((pa[i] || 0) < (pb[i] || 0)) return -1; }
  return 0;
}

async function check(currentVersion) {
  const remote = await fetchJson(PKG_URL);
  const latest = remote && remote.version;
  if (!latest) throw new Error('versão remota não encontrada');
  return { current: currentVersion, latest, updateAvailable: cmp(latest, currentVersion) > 0, url: RELEASES_URL };
}

module.exports = { check, RELEASES_URL };
