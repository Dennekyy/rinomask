'use strict';
// TESTE DE ESTRESSE do aceite de cookies: dezenas de variações reais de banner.
// Mede pelo DOM (o Camoufox roda evaluate em mundo isolado; window não cruza, DOM sim).
// Para cada caso: o botão de ACEITAR marca data-acc; iscas (rejeitar/links/decoys) marcam data-bad.
//   - casos de aceite: espera data-acc=1 e data-bad=null
//   - casos "não clicar": espera data-acc=null e data-bad=null
// Rodar: node scripts/_enode.js scripts/test-consent.js
const path = require('path'); const os = require('os');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');
const cookieRobot = require('../src/cookieRobot');

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${!ok && d ? ' — ' + d : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ACC = "this.setAttribute('x','');document.body.setAttribute('data-acc','1')"; // marca aceite (e some)
const BAD = "document.body.setAttribute('data-bad','1')"; // marca clique indevido

// banner com texto de cookie + os botões dados (html)
const banner = (inner) => `<div style="position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#222;color:#fff;padding:16px">
  <p>Este site utiliza cookies e tecnologias semelhantes, conforme nossa Política de Privacidade, para melhorar sua experiência.</p>${inner}</div>`;

// casos: { name, html, click:true/false }
const CASES = [
  { name: 'Folha-style: texto cookie + botão "OK"', click: true, html: banner(`<a href="#" onclick="${BAD}">Política de Privacidade</a> <button onclick="${ACC}">OK</button>`) },
  { name: 'Aceitar todos os cookies', click: true, html: banner(`<button onclick="${BAD}">Rejeitar</button><button onclick="${ACC}">Aceitar todos os cookies</button>`) },
  { name: 'OK, entendi', click: true, html: banner(`<button onclick="${ACC}">OK, entendi</button>`) },
  { name: 'link <a> "Concordo"', click: true, html: banner(`<a href="#" onclick="${ACC}">Concordo</a>`) },
  { name: 'div role=button "Aceitar"', click: true, html: banner(`<div role="button" tabindex="0" onclick="${ACC}">Aceitar</div>`) },
  { name: 'Aceitar + Rejeitar + Configurar', click: true, html: banner(`<button onclick="${BAD}">Configurar</button><button onclick="${BAD}">Rejeitar</button><button onclick="${ACC}">Aceitar</button>`) },
  { name: 'Continuar + link "Saiba mais"', click: true, html: banner(`<a href="#" onclick="${BAD}">Saiba mais</a><button onclick="${ACC}">Continuar</button>`) },
  { name: 'Prosseguir', click: true, html: banner(`<button onclick="${ACC}">Prosseguir</button>`) },
  { name: 'EN: Accept all + Reject all', click: true, html: banner(`<button onclick="${BAD}">Reject all</button><button onclick="${ACC}">Accept all</button>`) },
  { name: 'EN: I agree', click: true, html: banner(`<button onclick="${ACC}">I agree</button>`) },
  { name: 'EN: Got it', click: true, html: banner(`<button onclick="${ACC}">Got it</button>`) },
  { name: 'botão com <span> aninhado', click: true, html: banner(`<button onclick="${ACC}"><span>Aceitar</span> <i>cookies</i></button>`) },
  { name: 'MAIÚSCULAS "ACEITAR TODOS"', click: true, html: banner(`<button onclick="${ACC}">ACEITAR TODOS</button>`) },
  { name: 'ícone: aria-label="Aceitar cookies"', click: true, html: banner(`<button aria-label="Aceitar cookies" onclick="${ACC}">✓</button>`) },
  // negativos: NÃO deve clicar
  { name: 'DECOY: "OK" SEM contexto de cookie', click: false, html: `<div style="padding:20px"><p>Bem-vindo ao site.</p><button onclick="${BAD}">OK</button></div>` },
  { name: 'DECOY: "Aceitar convite" sem cookie', click: false, html: `<div style="padding:20px"><p>Você foi convidado.</p><button onclick="${BAD}">Aceitar convite</button></div>` },
  { name: 'NEG: só "Rejeitar/Gerenciar" (sem aceitar)', click: false, html: banner(`<button onclick="${BAD}">Gerenciar opções</button><button onclick="${BAD}">Rejeitar</button>`) },
  { name: 'real: "Usamos cookies... OK" (caso do usuário)', click: true, html: `<div style="position:fixed;bottom:0;left:0;right:0;background:#222;color:#fff;padding:16px"><span>Usamos cookies para personalizar a sua experiência. Ao utilizar nossos sites e serviços, você concorda com o uso de cookies por nossa parte conforme estabelecido na nossa <a href="#" onclick="${BAD}">Política de privacidade</a>.</span> <button onclick="${ACC}">OK</button></div>` },
  { name: 'estrutura: texto e botão em ramos separados', click: true, html: `<div style="position:fixed;bottom:0;left:0;right:0;background:#222;color:#fff;padding:16px;display:flex"><div><p>Este site usa cookies conforme a Política de Privacidade.</p></div><div><button onclick="${BAD}">Configurar</button><button onclick="${ACC}">OK</button></div></div>` },
];

(async function main() {
  const tmp = path.join(os.tmpdir(), 'rino-consent-' + Date.now());
  store.setDataDir(tmp);
  launcher.setPersistFingerprint((id, d) => store.setFingerprintData(id, d));
  const p = store.createProfile({ name: 'C', os: 'Windows', startUrl: 'about:blank' });
  await launcher.launchAutomation(store.getProfile(p.id), { headless: true });
  const page = await launcher.getPage(p.id);

  for (const c of CASES) {
    await page.setContent(`<!doctype html><html><body>${c.html}</body></html>`);
    await sleep(300);
    await cookieRobot.acceptConsent(page);
    const r = await page.evaluate(() => ({ acc: document.body.getAttribute('data-acc'), bad: document.body.getAttribute('data-bad') }));
    if (c.click) check(c.name, r.acc === '1' && !r.bad, JSON.stringify(r));
    else check(c.name, !r.acc && !r.bad, 'clicou indevidamente ' + JSON.stringify(r));
  }

  // shadow DOM + iframe (estruturas especiais)
  await page.setContent('<!doctype html><html><body><div id="h"></div></body></html>');
  await page.evaluate(() => { const s = document.getElementById('h').attachShadow({ mode: 'open' }); s.innerHTML = "<div style='position:fixed;inset:0'>Usamos cookies. <button onclick=\"document.body.setAttribute('data-bad','1')\">Configurar</button><button onclick=\"document.body.setAttribute('data-acc','1')\">Aceitar</button></div>"; });
  await sleep(300); await cookieRobot.acceptConsent(page);
  let r = await page.evaluate(() => ({ acc: document.body.getAttribute('data-acc'), bad: document.body.getAttribute('data-bad') }));
  check('shadow DOM: aceita e não configura', r.acc === '1' && !r.bad, JSON.stringify(r));

  await page.setContent(`<!doctype html><html><body><iframe srcdoc="<div>Aviso de cookies. <button onclick='document.body.setAttribute(&quot;data-bad&quot;,&quot;1&quot;)'>Recusar</button><button onclick='document.body.setAttribute(&quot;data-acc&quot;,&quot;1&quot;)'>Aceitar tudo</button></div>"></iframe></body></html>`);
  await sleep(700); await cookieRobot.acceptConsent(page);
  const ifr = page.frames().find((fr) => fr !== page.mainFrame());
  r = ifr ? await ifr.evaluate(() => ({ acc: document.body.getAttribute('data-acc'), bad: document.body.getAttribute('data-bad') })) : {};
  check('iframe: aceita e não recusa', r.acc === '1' && !r.bad, JSON.stringify(r));

  // banner que aparece com ATRASO (2.5s) — testa a janela persistente de ~7s
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.evaluate(() => setTimeout(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#222;color:#fff;padding:16px';
    d.innerHTML = "Usamos cookies e tecnologias semelhantes. <button onclick=\"document.body.setAttribute('data-acc','1')\">OK</button>";
    document.body.appendChild(d);
  }, 2500));
  await cookieRobot.acceptConsent(page);
  r = await page.evaluate(() => ({ acc: document.body.getAttribute('data-acc') }));
  check('banner com atraso (2,5s): aceito dentro da janela', r.acc === '1', JSON.stringify(r));

  await launcher.stop(p.id).catch(() => {});
  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(2); });
