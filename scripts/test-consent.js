'use strict';
// Valida a aceitação de cookies (heurística DOM + shadow DOM + iframe), determinístico e offline.
// Mede pelo DOM (atributos/elementos), pois o Camoufox roda o evaluate em mundo isolado — variáveis
// de window NÃO cruzam os mundos, mas o DOM é compartilhado. Rodar: node scripts/_enode.js scripts/test-consent.js
const path = require('path'); const os = require('os');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');
const cookieRobot = require('../src/cookieRobot');

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mark = (attr) => `document.body.setAttribute('${attr}','1')`;

(async function main() {
  const tmp = path.join(os.tmpdir(), 'rino-consent-' + Date.now());
  store.setDataDir(tmp);
  launcher.setPersistFingerprint((id, d) => store.setFingerprintData(id, d));
  const p = store.createProfile({ name: 'C', os: 'Windows', startUrl: 'about:blank' });
  await launcher.launchAutomation(store.getProfile(p.id), { headless: true });
  const page = await launcher.getPage(p.id);

  // ---- A) overlay normal: rejeitar/gerenciar + aceitar; e um "OK" solto fora do banner ----
  await page.setContent(`<!doctype html><html><body>
    <button onclick="${mark('data-ok')}">OK</button>
    <div id="cc" style="position:fixed;inset:0;z-index:99999;background:#0008">
      <div style="background:#fff;padding:20px">
        <p>Usamos cookies e tecnologias para personalizar conteúdo. Veja nossa política de privacidade.</p>
        <button onclick="${mark('data-manage')}">Gerenciar opções</button>
        <button onclick="${mark('data-reject')}">Rejeitar</button>
        <button class="cookie-accept" onclick="${mark('data-accept')};document.getElementById('cc').remove()">Aceitar todos os cookies</button>
      </div></div></body></html>`);
  await sleep(500);
  await cookieRobot.acceptConsent(page);
  let f = await page.evaluate(() => ({ accept: document.body.getAttribute('data-accept'), reject: document.body.getAttribute('data-reject'), manage: document.body.getAttribute('data-manage'), ok: document.body.getAttribute('data-ok'), gone: !document.getElementById('cc') }));
  check('overlay: clicou em ACEITAR e fechou o banner', f.accept === '1' && f.gone, JSON.stringify(f));
  check('overlay: NÃO clicou em rejeitar/gerenciar/OK-solto', !f.reject && !f.manage && !f.ok);

  // ---- B) shadow DOM ----
  await page.setContent('<!doctype html><html><body><div id="host"></div></body></html>');
  await page.evaluate(() => {
    const sr = document.getElementById('host').attachShadow({ mode: 'open' });
    sr.innerHTML = '<div style="position:fixed;inset:0;z-index:9999">Este site usa cookies. ' +
      "<button onclick=\"document.body.setAttribute('data-sreject','1')\">Configurar</button>" +
      "<button id=\"acc\" onclick=\"document.body.setAttribute('data-saccept','1')\">Aceitar</button></div>";
  });
  await sleep(400);
  await cookieRobot.acceptConsent(page);
  f = await page.evaluate(() => ({ accept: document.body.getAttribute('data-saccept'), reject: document.body.getAttribute('data-sreject') }));
  check('shadow DOM: clicou em ACEITAR', f.accept === '1', JSON.stringify(f));
  check('shadow DOM: NÃO clicou em configurar', !f.reject);

  // ---- C) iframe (sinaliza no DOM do próprio iframe; lido pelo frame) ----
  await page.setContent(`<!doctype html><html><body><iframe srcdoc="
    <div>Aviso de cookies e consentimento.
    <button onclick='document.body.setAttribute(&quot;data-ifreject&quot;,&quot;1&quot;)'>Recusar</button>
    <button onclick='document.body.setAttribute(&quot;data-ifaccept&quot;,&quot;1&quot;)'>Aceitar tudo</button></div>"></iframe></body></html>`);
  await sleep(800);
  await cookieRobot.acceptConsent(page);
  const ifr = page.frames().find((fr) => fr !== page.mainFrame());
  f = ifr ? await ifr.evaluate(() => ({ accept: document.body.getAttribute('data-ifaccept'), reject: document.body.getAttribute('data-ifreject') })) : {};
  check('iframe: clicou em ACEITAR', f.accept === '1', JSON.stringify(f));
  check('iframe: NÃO clicou em recusar', !f.reject);

  await launcher.stop(p.id).catch(() => {});
  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
