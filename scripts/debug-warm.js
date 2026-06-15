'use strict';
// MODO DEBUG do aceite de cookies: visita sites reais, captura o HTML do banner, roda o
// aceitador, verifica se o banner sumiu (sucesso/falha) e salva tudo para análise.
// Saída: console (relatório + taxa de sucesso) + debug/consent/<host>.html (HTML dos banners).
// Rodar: node scripts/_enode.js scripts/debug-warm.js
const path = require('path'); const os = require('os'); const fs = require('fs');
const store = require('../src/store');
const launcher = require('../src/browserLauncher');
const cookieRobot = require('../src/cookieRobot');

const SITES = (process.env.SITES || [
  'https://g1.globo.com/', 'https://www.uol.com.br/', 'https://www.folha.uol.com.br/',
  'https://www.estadao.com.br/', 'https://www.cnnbrasil.com.br/', 'https://www.metropoles.com/',
  'https://www.terra.com.br/', 'https://www.ig.com.br/', 'https://www.tecmundo.com.br/',
  'https://www.mercadolivre.com.br/', 'https://www.americanas.com.br/', 'https://www.magazineluiza.com.br/',
  'https://www.bbc.com/portuguese', 'https://www.reclameaqui.com.br/', 'https://canaltech.com.br/',
].join(',')).split(',').map((s) => s.trim()).filter(Boolean);

const OUT = path.join(__dirname, '..', 'debug', 'consent');
fs.mkdirSync(OUT, { recursive: true });
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u.replace(/[^a-z0-9]/gi, '_'); } };

// Descreve, em CADA frame, os contêineres que parecem banner de cookie (texto + tamanho) e seus
// botões. Retorna { visible:bool, items:[{frame,htmlLen,html,buttons:[{tag,text,reject}],picked}] }.
function describeInFrame() {
  var ACCEPT = /(aceit|accept|concord|i agree|\bagree\b|allow|permitir|consinto|consent|\bok\b|\bsim\b|\byes\b|entendi|got it|prossegui|continuar|tudo bem|understood|ciente|de acordo)/i;
  var REJECT = /(rejeit|recus|reject|decline|negar|gerenciar|configurar|personalizar|customize|manage|settings|prefer|op[cç][õo]es|mais op|saiba mais|learn more|only necessary|apenas (necess|essenc)|essenciais|necess[aá]rios|n[aã]o aceit|withdraw|pol[ií]tica|privacy policy|cookie policy|mais tarde|agora n[aã]o|not now|depois|dispensar|dismiss)/i;
  var COOKIE = /(cookie|consent|consentimento|gdpr|lgpd)/i;
  var inIframe = true; try { inIframe = window.top !== window.self; } catch (e) { inIframe = true; }
  function txt(el) { try { return ((el.innerText || el.textContent || '') + '').replace(/\s+/g, ' ').trim(); } catch (e) { return ''; } }
  function vis(el) { try { var r = el.getBoundingClientRect(); var s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity || '1') > 0.05; } catch (e) { return false; } }
  function isOverlay(el) { var n = el, h = 0; while (n && h < 6) { try { var s = getComputedStyle(n); if (s.position === 'fixed' || s.position === 'sticky') return true; if (s.position !== 'static' && (parseInt(s.zIndex, 10) || 0) >= 100) return true; } catch (e) {} n = n.parentElement || (n.getRootNode && n.getRootNode().host); h++; } return false; }
  function clickable(el) { var t = (el.tagName || '').toLowerCase(); if (t === 'button' || t === 'a' || t === 'summary') return true; if (el.getAttribute && (el.getAttribute('role') === 'button' || el.getAttribute('onclick'))) return true; if (t === 'input') { var ty = (el.type || '').toLowerCase(); return ty === 'button' || ty === 'submit'; } if (t.indexOf('-') > 0) return true; try { if (getComputedStyle(el).cursor === 'pointer' && txt(el) && txt(el).length < 40) return true; } catch (e) {} return false; }
  var roots = [document]; try { var all = document.querySelectorAll('*'); for (var a = 0; a < all.length; a++) if (all[a].shadowRoot) roots.push(all[a].shadowRoot); } catch (e) {}
  var containers = [];
  for (var r = 0; r < roots.length; r++) {
    var blocks; try { blocks = roots[r].querySelectorAll('div,section,aside,dialog,form,footer,[role="dialog"],[class*="cookie" i],[id*="cookie" i],[class*="consent" i]'); } catch (e) { continue; }
    for (var i = 0; i < blocks.length; i++) { var el = blocks[i]; var t = txt(el); if (t.length < 20 || t.length > 1200) continue; if (!COOKIE.test(t)) continue; if (!vis(el)) continue; if (!inIframe && !isOverlay(el)) continue; containers.push(el); }
  }
  containers.sort(function (x, y) { return txt(x).length - txt(y).length; });
  var items = [];
  for (var c = 0; c < Math.min(containers.length, 3); c++) {
    var el = containers[c]; var q = el.querySelectorAll('*'); var btns = [];
    for (var j = 0; j < q.length; j++) { var b = q[j]; if (!clickable(b) || !vis(b)) continue; var l = (txt(b) || (b.getAttribute && (b.getAttribute('aria-label') || b.getAttribute('title'))) || '').trim(); if (!l || l.length > 60) continue; btns.push({ tag: (b.tagName || '').toLowerCase(), text: l, reject: REJECT.test(l), accept: ACCEPT.test(l) && !REJECT.test(l) }); }
    var picked = btns.filter(function (x) { return x.accept; }); var pick = picked.length ? picked[picked.length - 1].text : (btns.filter(function (x) { return !x.reject; }).length === 1 ? btns.filter(function (x) { return !x.reject; })[0].text : null);
    items.push({ html: (el.outerHTML || '').slice(0, 2500), buttons: btns, picked: pick });
  }
  return { visible: items.length > 0, items: items };
}

async function describe(page) {
  const out = { visible: false, items: [] };
  for (const fr of page.frames().slice(0, 8)) {
    try { const d = await fr.evaluate(describeInFrame); if (d && d.visible) { out.visible = true; d.items.forEach((it) => out.items.push({ ...it, frame: fr === page.mainFrame() ? 'main' : (fr.url() || 'iframe').slice(0, 60) })); } } catch (e) {}
  }
  return out;
}

(async function main() {
  const tmp = path.join(os.tmpdir(), 'rino-dbg-' + Date.now());
  store.setDataDir(tmp);
  launcher.setPersistFingerprint((id, d) => store.setFingerprintData(id, d));
  const p = store.createProfile({ name: 'Dbg', os: 'Windows', startUrl: 'about:blank' });
  await launcher.launchAutomation(store.getProfile(p.id), { headless: true });
  const ctx = launcher.getContext(p.id);
  const page = await launcher.getPage(p.id);

  const rows = [];
  for (const url of SITES) {
    const h = host(url);
    const row = { host: h, hadBanner: false, clicked: false, dismissed: false, picked: null, frame: null, note: '' };
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 4500)); // deixa o CMP injetar
      const before = await describe(page);
      row.hadBanner = before.visible;
      if (before.visible) {
        const it = before.items[0];
        row.picked = it.picked; row.frame = it.frame;
        // salva o HTML do banner + os botões pra análise
        const dump = `<!-- ${url}\n   frame: ${it.frame}\n   botões: ${JSON.stringify(it.buttons)}\n   algoritmo escolheria: ${it.picked}\n-->\n${before.items.map((x) => x.html).join('\n\n<!-- ===== -->\n\n')}`;
        fs.writeFileSync(path.join(OUT, h + '.html'), dump);
      } else {
        row.note = 'nenhum banner detectado';
      }
      row.clicked = await cookieRobot.acceptConsent(page);
      await new Promise((r) => setTimeout(r, 2000));
      const after = await describe(page);
      row.dismissed = row.hadBanner && !after.visible;
    } catch (e) { row.note = 'erro: ' + (e.message || '').slice(0, 50); }
    rows.push(row);
    const tag = !row.hadBanner ? '· sem banner' : (row.dismissed ? '✅ ACEITOU' : '❌ FALHOU');
    console.log(`  ${tag.padEnd(12)} ${row.host.padEnd(22)} clicou=${row.clicked} escolheu="${row.picked || '-'}" (${row.frame || '-'}) ${row.note}`);
  }

  const withBanner = rows.filter((r) => r.hadBanner);
  const ok = withBanner.filter((r) => r.dismissed);
  console.log('\n  ===== DESEMPENHO =====');
  console.log(`  sites visitados: ${rows.length}`);
  console.log(`  com banner detectado: ${withBanner.length}`);
  console.log(`  banners ACEITOS (sumiram): ${ok.length}`);
  console.log(`  taxa de sucesso (sobre os com banner): ${withBanner.length ? Math.round((ok.length / withBanner.length) * 100) : 0}%`);
  const falhas = withBanner.filter((r) => !r.dismissed).map((r) => r.host);
  const semBanner = rows.filter((r) => !r.hadBanner).map((r) => r.host);
  if (falhas.length) console.log('  FALHAS (HTML salvo em debug/consent/): ' + falhas.join(', '));
  if (semBanner.length) console.log('  sem banner detectado: ' + semBanner.join(', '));
  console.log(`\n  HTMLs salvos em: ${OUT}`);

  await launcher.stop(p.id).catch(() => {});
  await require('fs/promises').rm(tmp, { recursive: true, force: true }).catch(() => {});
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(1); });
