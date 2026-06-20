'use strict';

// Cookie Robot — aquecimento com JORNADA: começo → meio → fim, direcionado ao nicho do perfil.
//   começo: estabelece base (busca + aceita consentimento)
//   meio:   constrói interesse coerente (assiste um vídeo + lê 1–2 sites do tema)
//   fim:    "aterrissa" no destino (a plataforma do perfil), sem login
// Tem TETO GLOBAL de tempo e TIMEOUT por etapa → SEMPRE termina (e o navegador fecha).
// Não importa cookies de terceiros (isso contaminaria a identidade do perfil).

const { rand, sleep, dwell, humanType, humanScroll, clickMaybe } = require('./humanInput');
// Conteúdo de aquecimento por LOCALE × nicho (coerência com a região do perfil) e o scoring v2.
const { pickPool, scoreWarmth, avoidFilter } = require('./warmContent');

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;

// Executa uma promessa com teto de tempo; se estourar, segue a vida (não derruba o aquecimento).
function withTimeout(promise, ms, label) {
  let t;
  const guard = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('etapa "' + label + '" expirou')), ms); });
  return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(t)), guard]);
}

// Pool padrão (pt-BR) usado pelas tarefas "soltas" de teste; o aquecimento real escolhe o pool
// coerente com o locale do perfil via pickPool(locale, niche). Ver src/warmContent.js.
const DEFAULT_POOL = pickPool('pt-BR', 'default');

// ---- Consentimento de cookies (estratégia híbrida) ----
// 1) caminho rápido: seletores conhecidos de alta precisão.
// 2) heurística genérica (ideia do usuário): varre o DOM + SHADOW DOM + IFRAMES procurando o
//    "contexto de cookie" (palavras cookie/consent/privacidade) e, dentro dele, o botão de
//    ACEITAR (ignorando rejeitar/gerenciar/configurar). Funciona pra banners que aparecem em
//    qualquer lugar, sobrepostos ao conteúdo. Não depende de rolagem.
const CONSENT_SELECTORS = [
  '#onetrust-accept-btn-handler', 'button#L2AGLb', '#bnp_btn_accept',
  '.fc-cta-consent', '#accept-choices', '[data-testid="accept-button"]',
  'button[aria-label*="Accept" i]', 'button[aria-label*="Aceitar" i]', 'button[mode="primary"]',
  '#didomi-notice-agree-button', 'tp-yt-paper-button[aria-label*="Aceitar" i]',
];

// Executado DENTRO de cada frame. Abordagem EMPÍRICA "contêiner-primeiro": acha o bloco que É
// um banner de cookie (texto sobre cookie/consentimento/privacidade, do tamanho de um banner) e,
// dentro dele, clica no ACEITAR; se não houver texto de aceite explícito, clica no único botão
// que não seja rejeitar/gerenciar/política (cobre "OK" implícito). Retorna o texto clicado (ou null).
/* eslint-disable */
function dismissConsentInFrame() {
  // Multilíngue (PT/EN/ES) — com proxy, o banner aparece no idioma do país do perfil.
  var ACCEPT = /(aceit|accept|acept|concord|i agree|\bagree\b|allow|permitir|consinto|consent|\bok\b|\bsim\b|\byes\b|entendi|got it|prossegui|continuar|tudo bem|understood|ciente|de acordo|de acuerdo|estoy de acuerdo)/i;
  var REJECT = /(rejeit|rechaz|recus|reject|decline|negar|gerenciar|gestionar|configurar|personalizar|customize|manage|settings|ajustes|prefer)/i;
  var REJECT2 = /(op[cç][õo]es|opciones|m[aá]s op|mais op|saiba mais|learn more|only necessary|solo (necesarias|esenciales)|apenas (necess|essenc)|essenciais|necess[aá]rios|n[aã]o aceit|optar por no|withdraw|pol[ií]tica|privacy policy|cookie policy|aviso de privac|privacidad|\bprivacy\b|mais tarde|agora n[aã]o|not now|depois|dispensar|dismiss)/i;
  // Específico de banner de cookie (NÃO casa rodapé que só cita "privacidade").
  var COOKIE = /(cookie|consent|consentimento|gdpr|lgpd)/i;
  var isReject = function (s) { return REJECT.test(s) || REJECT2.test(s); };
  var inIframe = true; try { inIframe = window.top !== window.self; } catch (e) { inIframe = true; } // cross-origin = iframe (já é overlay)

  function txt(el) { try { return ((el.innerText || el.textContent || '') + '').replace(/\s+/g, ' ').trim(); } catch (e) { return ''; } }
  function label(el) { var l = txt(el); if (!l && el.getAttribute) l = el.getAttribute('aria-label') || el.getAttribute('title') || ''; if (!l) l = el.value || ''; return (l + '').replace(/\s+/g, ' ').trim(); }
  function vis(el) { try { var r = el.getBoundingClientRect(); var s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity || '1') > 0.05; } catch (e) { return false; } }
  function clickable(el) {
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || tag === 'summary') return true;
    if (el.getAttribute && (el.getAttribute('role') === 'button' || el.getAttribute('onclick'))) return true;
    if (el.onclick) return true;
    if (tag === 'input') { var ty = (el.type || '').toLowerCase(); return ty === 'button' || ty === 'submit'; }
    if (tag.indexOf('-') > 0) return true; // custom element (tp-yt-paper-button, etc.)
    try { if (getComputedStyle(el).cursor === 'pointer' && label(el).length > 0 && label(el).length < 40) return true; } catch (e) {}
    return false;
  }
  // Banner de cookie de verdade é um OVERLAY (fixed/sticky ou z-index alto sobre o conteúdo).
  // Isso separa o banner do RODAPÉ/menu estático que também cita "cookies/privacidade".
  function isOverlay(el) {
    var n = el, h = 0;
    while (n && h < 6) {
      try { var s = getComputedStyle(n); if (s.position === 'fixed' || s.position === 'sticky') return true; if (s.position !== 'static' && (parseInt(s.zIndex, 10) || 0) >= 100) return true; } catch (e) {}
      n = n.parentElement || (n.getRootNode && n.getRootNode().host); h++;
    }
    return false;
  }
  // coleta raízes (document + shadow roots abertos)
  var roots = [document];
  try { var all = document.querySelectorAll('*'); for (var a = 0; a < all.length; a++) if (all[a].shadowRoot) roots.push(all[a].shadowRoot); } catch (e) {}

  // 1) acha contêineres-banner: overlay visível com texto de cookie, do tamanho de um aviso
  var containers = [];
  for (var r = 0; r < roots.length; r++) {
    var blocks; try { blocks = roots[r].querySelectorAll('div,section,aside,dialog,form,footer,[class*="cookie" i],[id*="cookie" i],[class*="consent" i],[id*="consent" i],[role="dialog"],[aria-label*="cookie" i]'); } catch (e) { continue; }
    for (var i = 0; i < blocks.length; i++) {
      var el = blocks[i]; var t = txt(el);
      if (t.length < 20 || t.length > 2500) continue; // tem texto, mas é um banner (não a página inteira)
      if (!COOKIE.test(t)) continue;
      if (!vis(el)) continue;
      if (!inIframe && !isOverlay(el)) continue; // no frame principal, exige overlay (exclui rodapé)
      containers.push(el);
    }
  }
  containers.sort(function (x, y) { return txt(x).length - txt(y).length; }); // o mais específico (menor) primeiro

  function pickAcceptIn(container) {
    var q; try { q = container.querySelectorAll('*'); } catch (e) { return null; }
    var cands = [];
    for (var i = 0; i < q.length; i++) { var el = q[i]; if (!clickable(el) || !vis(el)) continue; var l = label(el); if (!l || l.length > 60) continue; cands.push({ el: el, l: l }); }
    if (!cands.length) return null;
    var accepts = cands.filter(function (c) { return ACCEPT.test(c.l) && !isReject(c.l); });
    if (accepts.length) return accepts[accepts.length - 1].el; // último ~ botão primário (à direita)
    var neutral = cands.filter(function (c) { return !isReject(c.l); }); // "OK" implícito: único não-rejeição
    if (neutral.length === 1) return neutral[0].el;
    return null;
  }

  function take(btn) {
    try { btn.setAttribute('data-rino-accept', '1'); } catch (e) {}   // marca p/ clique CONFIÁVEL via Playwright
    try { btn.scrollIntoView({ block: 'center' }); } catch (e) {}
    try { btn.click(); } catch (e) {}                                  // fallback in-page (untrusted)
    return label(btn).slice(0, 50);
  }
  for (var c = 0; c < containers.length; c++) {
    var btn = pickAcceptIn(containers[c]);
    if (btn) return take(btn);
  }
  // 2) há overlay de cookie, mas o aceite está num contêiner SEPARADO (CMPs como AdOpt): procura
  //    um botão de ACEITE explícito em qualquer overlay do frame (escopo seguro: só com banner presente).
  if (containers.length) {
    var pool = [];
    for (var r2 = 0; r2 < roots.length; r2++) { var cl; try { cl = roots[r2].querySelectorAll('button,a,summary,[role="button"],input[type="button"],input[type="submit"],[onclick]'); } catch (e) { continue; } for (var z = 0; z < cl.length; z++) pool.push(cl[z]); }
    var acc2 = [];
    for (var z2 = 0; z2 < pool.length; z2++) {
      var e2 = pool[z2]; if (!vis(e2)) continue; var l2 = label(e2);
      if (!l2 || l2.length > 40 || isReject(l2) || !ACCEPT.test(l2)) continue;
      if (!inIframe && !isOverlay(e2)) continue;
      acc2.push(e2);
    }
    if (acc2.length) return take(acc2[acc2.length - 1]);
  }
  return null;
}
/* eslint-enable */

// Janela persistente (~7s): alguns CMPs injetam o banner com atraso. Sai assim que aceitar.
async function acceptConsent(page) {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    // 1) caminho rápido: seletores conhecidos (clique confiável via Playwright)
    for (const fr of page.frames().slice(0, 8)) {
      for (const sel of CONSENT_SELECTORS) {
        try { if (await fr.locator(sel).count()) { if (await clickMaybe(fr, fr.locator(sel), 2500)) { await sleep(700); return true; } } } catch (e) {}
      }
    }
    // 2) heurística contêiner-primeiro (DOM + shadow + iframes) por frame.
    //    A função marca o botão (data-rino-accept); aqui damos o clique CONFIÁVEL via Playwright
    //    (alguns CMPs, ex. Mercado Livre, ignoram cliques não-confiáveis/isTrusted).
    for (const fr of page.frames().slice(0, 8)) {
      let hit = null;
      try { hit = await fr.evaluate(dismissConsentInFrame); } catch (e) {}
      if (hit) {
        try { await fr.locator('[data-rino-accept="1"]').first().click({ timeout: 2500 }); } catch (e) {}
        try { await fr.evaluate(() => document.querySelectorAll('[data-rino-accept]').forEach((e) => e.removeAttribute('data-rino-accept'))); } catch (e) {}
        await sleep(700);
        return true;
      }
    }
    await sleep(1100);
  }
  return false;
}

async function goto(page, url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }); return true; }
    catch (e) { await sleep(1000); }
  }
  return false;
}

async function ensurePlaying(page) {
  await dwell(2200, 3800);
  try {
    const playing = await page.evaluate(() => { const v = document.querySelector('video'); return !!(v && !v.paused && v.currentTime > 0); }).catch(() => false);
    if (!playing) {
      const btn = page.locator('.ytp-play-button, .ytp-large-play-button').first();
      if (await btn.count().catch(() => 0)) await btn.click({ timeout: 2500 }).catch(() => {});
      else await page.keyboard.press('k').catch(() => {});
    }
  } catch (e) {}
}
async function watchVideo(page, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await sleep(rand(4000, 8000));
    if (chance(0.4)) await humanScroll(page, rand(1, 2));
    if (chance(0.25)) await page.mouse.move(rand(200, 900), rand(150, 600)).catch(() => {});
  }
}

/* ===================== Etapas (todas direcionadas pelo nicho N) ===================== */

// Motores de busca + seletores. DuckDuckGo entra como rede de segurança (Fase 4).
const ENGINES = {
  google: { url: 'https://www.google.com/', box: 'textarea[name="q"], input[name="q"]', result: '#search a:has(h3), #rso a:has(h3)' },
  bing: { url: 'https://www.bing.com/', box: '#sb_form_q, textarea[name="q"], input[name="q"]', result: '#b_results h2 a' },
  duckduckgo: { url: 'https://duckduckgo.com/', box: '#searchbox_input, input[name="q"]', result: 'a[data-testid="result-title-a"], a.result__a, #links h2 a' },
};

// Busca RESILIENTE (Fase 4): tenta o motor pedido e, se ele degradar (não carrega ou some a
// caixa de busca), cai para os outros — Google → Bing → DuckDuckGo. Retorna o motor que funcionou.
async function searchEngine(page, N, engine = 'google', acc = {}) {
  const order = [engine, 'google', 'bing', 'duckduckgo'].filter((e, i, a) => ENGINES[e] && a.indexOf(e) === i);
  const query = pick(N.q);
  for (const eng of order) {
    const E = ENGINES[eng];
    if (!(await goto(page, E.url))) continue;
    if (await acceptConsent(page)) acc.consents = (acc.consents || 0) + 1;
    const box = page.locator(E.box);
    if (!(await box.count().catch(() => 0))) continue; // motor degradado → tenta o próximo
    await humanType(page, box, query);
    await dwell(400, 1000);
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await dwell(1800, 3500); await humanScroll(page, rand(2, 4));
    if (chance(0.8) && await clickMaybe(page, page.locator(E.result).first())) {
      await dwell(2500, 6000); await humanScroll(page, rand(2, 4));
    }
    return eng;
  }
  return null;
}

async function watchYouTube(page, N, acc = {}) {
  await goto(page, 'https://www.youtube.com/');
  if (await acceptConsent(page)) acc.consents = (acc.consents || 0) + 1;
  await dwell(1400, 2600);
  const box = page.locator('input#search, ytd-searchbox input, input[name="search_query"]');
  if (await box.count().catch(() => 0)) {
    await humanType(page, box, pick(N.vq));
    await dwell(300, 700);
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForSelector('ytd-video-renderer, ytd-rich-item-renderer, a#video-title', { timeout: 10000 }).catch(() => {});
    await dwell(1400, 2600); await humanScroll(page, rand(1, 2));
  }
  let opened = await clickMaybe(page, page.locator('ytd-video-renderer a#video-title, a#video-title, ytd-rich-item-renderer a#video-title-link').first());
  if (!opened) opened = await clickMaybe(page, page.locator('a#thumbnail:has(img), ytd-thumbnail a').first());
  if (opened) {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await ensurePlaying(page);
    await watchVideo(page, rand(25000, 50000)); // assiste 25–50s
  }
}

async function browseSite(page, N, acc = {}, avoid) {
  await goto(page, pick(avoidFilter(N.sites, avoid)));
  if (await acceptConsent(page)) acc.consents = (acc.consents || 0) + 1;
  await dwell(2000, 4000); await humanScroll(page, rand(3, 6));
  if (chance(0.7) && await clickMaybe(page, page.locator('main a[href]:visible, article a[href]:visible, a[href^="/"]:visible').first())) {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await dwell(2200, 5000); await humanScroll(page, rand(2, 4));
  }
}

// FIM: aterrissa no destino do perfil (a plataforma), sem login — última atividade coerente.
async function landAtDestination(page, N, acc = {}, avoid) {
  const url = N.home || pick(avoidFilter(N.sites, avoid));
  await goto(page, url);
  if (await acceptConsent(page)) acc.consents = (acc.consents || 0) + 1;
  await dwell(3000, 6000); await humanScroll(page, rand(2, 4));
}

// Tarefas "soltas" (usadas por testes via { tasks: [...] }), no pool default (pt-BR).
const TASKS = {
  google: (p) => searchEngine(p, DEFAULT_POOL, 'google'),
  bing: (p) => searchEngine(p, DEFAULT_POOL, 'bing'),
  youtube: (p) => watchYouTube(p, DEFAULT_POOL),
  browse: (p) => browseSite(p, DEFAULT_POOL),
  maps: (p) => browseSite(p, DEFAULT_POOL),
};

// Monta a jornada começo → meio → fim (4–5 etapas), consumindo o POOL coerente (locale × nicho).
// acc acumula consentimentos aceitos; `avoid` (hosts recém-visitados) diversifica a leitura.
function buildJourney(pool, acc = {}, avoid) {
  const eng = pool.engine || 'google';
  // Variedade: às vezes Bing (ambos neutros de idioma) quando o pool prefere Google.
  const searchEng = (eng === 'google' && chance(0.25)) ? 'bing' : eng;
  const steps = [];
  steps.push({ label: 'início: busca', maxMs: 55000, run: (p) => searchEngine(p, pool, searchEng, acc) });
  steps.push({ label: 'interesse: vídeo', maxMs: 95000, run: (p) => watchYouTube(p, pool, acc) });
  steps.push({ label: 'interesse: leitura', maxMs: 60000, run: (p) => browseSite(p, pool, acc, avoid) });
  if (chance(0.5)) steps.push({ label: 'interesse: leitura', maxMs: 60000, run: (p) => browseSite(p, pool, acc, avoid) });
  steps.push({ label: 'destino: ' + (pool.home ? new URL(pool.home).hostname.replace('www.', '') : 'portal'), maxMs: 50000, run: (p) => landAtDestination(p, pool, acc, avoid) });
  return steps;
}

// Mede a MATURIDADE do perfil (v2). Além de cookies/domínios, distingue 1st/3rd-party
// (cookies cross-site = SameSite=None), persistente vs sessão, variedade de TLDs e storage
// local (localStorage/IndexedDB) da origem final. O scoring vive em warmContent.scoreWarmth.
async function measureWarmth(context, visited, page) {
  let cookies = [];
  try { cookies = await context.cookies(); } catch (e) {}
  const domainSet = new Set();
  const tldSet = new Set();
  let thirdParty = 0, firstParty = 0, persistent = 0, session = 0, secure = 0;
  for (const c of cookies) {
    const dom = String(c.domain || '').replace(/^\./, '');
    if (dom) {
      domainSet.add(dom);
      const parts = dom.split('.');
      if (parts.length >= 2) tldSet.add(parts.slice(-2).join('.'));
    }
    if (c.sameSite === 'None') thirdParty++; else firstParty++; // SameSite=None ~ cookie cross-site
    if (typeof c.expires === 'number' && c.expires > 0) persistent++; else session++;
    if (c.secure) secure++;
  }
  // Storage local da origem em que a página terminou (sinal extra de "vida" — best-effort).
  let ls = 0, idb = 0;
  if (page && !page.isClosed()) {
    try {
      const st = await page.evaluate(async () => {
        let l = 0, d = 0;
        try { l = window.localStorage ? window.localStorage.length : 0; } catch (e) {}
        try { if (indexedDB && indexedDB.databases) { const dbs = await indexedDB.databases(); d = (dbs || []).length; } } catch (e) {}
        return { l, d };
      });
      ls = st.l || 0; idb = st.d || 0;
    } catch (e) {}
  }
  const signals = {
    cookies: cookies.length,
    domains: domainSet.size,
    tlds: tldSet.size,
    firstParty, thirdParty, persistent, session, secure,
    localStorage: ls, indexedDB: idb,
    visited: visited || 0,
  };
  return { v: 2, score: scoreWarmth(signals), ...signals };
}

const MIN_DOMAINS = 4;     // Fase 4: variedade mínima de domínios distintos por aquecimento
const MIN_PASS_MS = 35000; // Fase 3: não inicia nova passada (modo meta) com pouco tempo restante

// Aquece um perfil já aberto. SEMPRE termina dentro do teto (budgetMs) e por etapa (maxMs).
// Usa o pool coerente com locale/niche. Opções:
//   targetScore — repete passadas até a maturidade ≥ alvo (ou o teto de tempo);
//   avoid       — hosts recém-visitados (execuções anteriores) a diversificar.
// Devolve um relatório (etapas com status, consentimentos, domínios, passadas).
async function warmUp(page, { tasks, niche, locale, region, onProgress, budgetMs, targetScore, avoid } = {}) {
  const context = page.context();
  const startedAt = Date.now();
  const deadline = startedAt + (budgetMs || 4 * 60 * 1000); // teto global
  const pool = pickPool(locale, niche);
  const acc = { consents: 0 };
  const recentAvoid = Array.isArray(avoid) ? avoid.slice() : [];
  const steps = [];
  const domainSet = new Set();
  const wantsTarget = typeof targetScore === 'number' && targetScore > 0;
  let stepIdx = 0, totalEst = 0, passes = 0, reachedTarget = false, lastScore = null;

  // Executa uma etapa com teto por etapa e global; registra status (Fase 4) e o domínio final.
  const runStep = async (step) => {
    if (Date.now() > deadline) return false;
    if (onProgress) onProgress({ label: step.label, index: stepIdx, total: Math.max(totalEst, stepIdx + 1) });
    const t0 = Date.now();
    let ok = false;
    try {
      if (page.isClosed()) page = await context.newPage();
      const left = deadline - Date.now();
      await withTimeout(step.run(page), Math.min(step.maxMs || 90000, Math.max(8000, left)), step.label);
      ok = true;
      try { const h = new URL(page.url()).hostname.replace(/^www\./, ''); if (h && h !== 'about' && h !== 'about:blank') domainSet.add(h); } catch (e) {}
    } catch (e) { /* timeout/erro de uma etapa não derruba o aquecimento */ }
    steps.push({ label: step.label, ok, ms: Date.now() - t0 });
    try { await dwell(1000, 2400); } catch (e) {}
    stepIdx++;
    return ok;
  };

  const makeReport = () => ({
    locale: pool.locale, niche: pool.niche, region: region || null,
    consents: acc.consents, steps, visitedDomains: Array.from(domainSet),
    durationMs: Date.now() - startedAt, passes,
    targetScore: wantsTarget ? targetScore : null, reachedTarget, lastScore,
  });

  // Modo "tarefas soltas" (testes): uma passada simples, sem meta/variedade.
  if (tasks && tasks.length) {
    const plan = tasks.filter((k) => TASKS[k]).map((k) => ({ label: k, maxMs: 95000, run: TASKS[k] }));
    totalEst = plan.length;
    for (const step of plan) await runStep(step);
    return { visited: steps.filter((s) => s.ok).length, total: steps.length, report: makeReport() };
  }

  // Jornada por nicho/locale. Com targetScore, repete passadas até atingir a meta ou o teto.
  do {
    const avoidNow = recentAvoid.concat(Array.from(domainSet));
    const journey = buildJourney(pool, acc, avoidNow);
    totalEst += journey.length;
    for (const step of journey) await runStep(step);
    passes++;
    if (wantsTarget) {
      try { const w = await measureWarmth(context, stepIdx, page); lastScore = w.score; if (w.score >= targetScore) { reachedTarget = true; break; } } catch (e) {}
    }
  } while (wantsTarget && (deadline - Date.now()) > MIN_PASS_MS);

  // Fase 4: garante um piso de domínios distintos mesmo com Google/YouTube degradados.
  while (domainSet.size < MIN_DOMAINS && (deadline - Date.now()) > 12000) {
    const avoidNow = recentAvoid.concat(Array.from(domainSet));
    await runStep({ label: 'reforço: leitura', maxMs: 45000, run: (p) => browseSite(p, pool, acc, avoidNow) });
  }

  return { visited: steps.filter((s) => s.ok).length, total: steps.length, report: makeReport() };
}

module.exports = { warmUp, TASKS, buildJourney, measureWarmth, acceptConsent };
