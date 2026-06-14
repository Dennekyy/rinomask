'use strict';

// Cookie Robot — aquecimento com JORNADA: começo → meio → fim, direcionado ao nicho do perfil.
//   começo: estabelece base (busca + aceita consentimento)
//   meio:   constrói interesse coerente (assiste um vídeo + lê 1–2 sites do tema)
//   fim:    "aterrissa" no destino (a plataforma do perfil), sem login
// Tem TETO GLOBAL de tempo e TIMEOUT por etapa → SEMPRE termina (e o navegador fecha).
// Não importa cookies de terceiros (isso contaminaria a identidade do perfil).

const { rand, sleep, dwell, humanType, humanScroll, clickMaybe } = require('./humanInput');

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;

// Executa uma promessa com teto de tempo; se estourar, segue a vida (não derruba o aquecimento).
function withTimeout(promise, ms, label) {
  let t;
  const guard = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('etapa "' + label + '" expirou')), ms); });
  return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(t)), guard]);
}

// Pools genéricos (fallback).
const QUERIES = ['notícias de hoje', 'previsão do tempo', 'cotação do dólar', 'melhores séries 2026', 'curiosidades sobre o espaço', 'receita de bolo de cenoura', 'resultado do brasileirão'];
const VIDEO_Q = ['música para relaxar', 'documentário natureza 4k', 'notícias da semana resumo', 'lo-fi para estudar', 'podcast tecnologia'];
const SITES = ['https://g1.globo.com/', 'https://www.uol.com.br/', 'https://www.cnnbrasil.com.br/', 'https://pt.wikipedia.org/wiki/Especial:Aleat%C3%B3ria', 'https://www.bbc.com/portuguese'];

// Nichos: dão DIREÇÃO ao aquecimento (buscas/vídeos/sites coerentes + destino final).
const NICHES = {
  default: { q: QUERIES, vq: VIDEO_Q, sites: SITES, home: null },
  google: { q: QUERIES, vq: VIDEO_Q, sites: SITES, home: 'https://www.google.com/' },
  facebook: {
    q: ['notícias de hoje', 'memes do dia', 'receitas fáceis', 'grupos de venda na cidade'],
    vq: ['notícias da semana resumo', 'receitas fáceis e rápidas', 'música para relaxar'],
    sites: ['https://g1.globo.com/', 'https://www.uol.com.br/', 'https://www.metropoles.com/'],
    home: 'https://www.facebook.com/',
  },
  tiktok: {
    q: ['trends do tiktok', 'músicas em alta', 'desafios virais', 'dança viral'],
    vq: ['música em alta 2026', 'comédia stand up brasil', 'gameplay relaxante'],
    sites: ['https://www.adorocinema.com/', 'https://www.letras.mus.br/', 'https://www.tecmundo.com.br/'],
    home: 'https://www.tiktok.com/',
  },
  crypto: {
    q: ['preço do bitcoin hoje', 'o que é blockchain', 'como investir em cripto', 'cotação ethereum'],
    vq: ['análise bitcoin hoje', 'o que é blockchain explicado', 'notícias cripto da semana'],
    sites: ['https://www.infomoney.com.br/', 'https://br.cointelegraph.com/', 'https://www.investing.com/crypto/'],
    home: 'https://www.binance.com/pt-BR',
  },
};
const pickNiche = (n) => NICHES[String(n || '').toLowerCase()] || NICHES.default;

// ---- Consentimento robusto (bounded: poucos frames/botões, sem varredura infinita) ----
const CONSENT_SELECTORS = [
  '#onetrust-accept-btn-handler', 'button#L2AGLb', '#bnp_btn_accept',
  '.fc-cta-consent', '#accept-choices', '[data-testid="accept-button"]',
  'button[aria-label*="Accept" i]', 'button[aria-label*="Aceitar" i]', 'button[mode="primary"]',
  '#didomi-notice-agree-button', 'tp-yt-paper-button[aria-label*="Aceitar" i]',
];
const ACCEPT_TEXT = /^(aceitar tudo|aceitar todos|aceitar e fechar|aceitar|aceito|concordo|prosseguir|entendi|ok,? entendi|allow all|accept all|accept|i agree|agree|got it|allow|continuar|sim, aceito)$/i;

async function acceptConsent(page) {
  await sleep(rand(800, 1600));
  const frames = page.frames().slice(0, 5); // no máx. 5 frames
  for (const fr of frames) {
    for (const sel of CONSENT_SELECTORS) {
      try { if (await fr.locator(sel).count()) { if (await clickMaybe(fr, fr.locator(sel), 2500)) { await sleep(600); return true; } } } catch (e) {}
    }
    try {
      const btns = fr.getByRole('button');
      const n = Math.min(await btns.count().catch(() => 0), 18); // no máx. 18 botões
      for (let i = 0; i < n; i++) {
        const t = (await btns.nth(i).innerText({ timeout: 1500 }).catch(() => '')).trim();
        if (t && ACCEPT_TEXT.test(t)) { await btns.nth(i).click({ timeout: 2500 }).catch(() => {}); await sleep(600); return true; }
      }
    } catch (e) {}
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

async function searchEngine(page, N, engine = 'google') {
  await goto(page, engine === 'bing' ? 'https://www.bing.com/' : 'https://www.google.com/');
  await acceptConsent(page);
  const box = page.locator(engine === 'bing' ? '#sb_form_q, textarea[name="q"], input[name="q"]' : 'textarea[name="q"], input[name="q"]');
  if (!(await box.count().catch(() => 0))) return;
  await humanType(page, box, pick(N.q));
  await dwell(400, 1000);
  await page.keyboard.press('Enter').catch(() => {});
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await dwell(1800, 3500); await humanScroll(page, rand(2, 4));
  const result = engine === 'bing' ? '#b_results h2 a' : '#search a:has(h3), #rso a:has(h3)';
  if (chance(0.8) && await clickMaybe(page, page.locator(result).first())) {
    await dwell(2500, 6000); await humanScroll(page, rand(2, 4));
  }
}

async function watchYouTube(page, N) {
  await goto(page, 'https://www.youtube.com/');
  await acceptConsent(page);
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

async function browseSite(page, N) {
  await goto(page, pick(N.sites));
  await acceptConsent(page);
  await dwell(2000, 4000); await humanScroll(page, rand(3, 6));
  if (chance(0.7) && await clickMaybe(page, page.locator('main a[href]:visible, article a[href]:visible, a[href^="/"]:visible').first())) {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await dwell(2200, 5000); await humanScroll(page, rand(2, 4));
  }
}

// FIM: aterrissa no destino do perfil (a plataforma), sem login — última atividade coerente.
async function landAtDestination(page, N) {
  const url = N.home || pick(N.sites);
  await goto(page, url);
  await acceptConsent(page);
  await dwell(3000, 6000); await humanScroll(page, rand(2, 4));
}

// Tarefas "soltas" (usadas por testes via { tasks: [...] }), no nicho default.
const TASKS = {
  google: (p) => searchEngine(p, NICHES.default, 'google'),
  bing: (p) => searchEngine(p, NICHES.default, 'bing'),
  youtube: (p) => watchYouTube(p, NICHES.default),
  browse: (p) => browseSite(p, NICHES.default),
  maps: (p) => browseSite(p, NICHES.default),
};

// Monta a jornada começo → meio → fim (4–5 etapas), direcionada pelo nicho.
function buildJourney(N) {
  const steps = [];
  steps.push({ label: 'início: busca', maxMs: 55000, run: (p) => searchEngine(p, N, chance(0.25) ? 'bing' : 'google') });
  steps.push({ label: 'interesse: vídeo', maxMs: 95000, run: (p) => watchYouTube(p, N) });
  steps.push({ label: 'interesse: leitura', maxMs: 60000, run: (p) => browseSite(p, N) });
  if (chance(0.5)) steps.push({ label: 'interesse: leitura', maxMs: 60000, run: (p) => browseSite(p, N) });
  steps.push({ label: 'destino: ' + (N.home ? new URL(N.home).hostname.replace('www.', '') : 'portal'), maxMs: 50000, run: (p) => landAtDestination(p, N) });
  return steps;
}

async function measureWarmth(context, visited) {
  let cookies = [];
  try { cookies = await context.cookies(); } catch (e) {}
  const domains = new Set(cookies.map((c) => String(c.domain || '').replace(/^\./, '')).filter(Boolean)).size;
  const c = Math.min(50, cookies.length * 0.7);
  const d = Math.min(35, domains * 2.2);
  const v = Math.min(15, (visited || 0) * 1.5);
  return { score: Math.round(c + d + v), cookies: cookies.length, domains, visited: visited || 0 };
}

// Aquece um perfil já aberto. SEMPRE termina dentro do teto (budgetMs) e por etapa (maxMs).
async function warmUp(page, { tasks, niche, onProgress, budgetMs } = {}) {
  const context = page.context();
  const deadline = Date.now() + (budgetMs || 4 * 60 * 1000); // teto global ~4 min
  const N = pickNiche(niche);
  const plan = (tasks && tasks.length)
    ? tasks.filter((k) => TASKS[k]).map((k) => ({ label: k, maxMs: 95000, run: TASKS[k] }))
    : buildJourney(N);

  let i = 0, visited = 0;
  for (const step of plan) {
    if (Date.now() > deadline) break; // teto global → garante o fim
    if (onProgress) onProgress({ label: step.label, index: i, total: plan.length });
    try {
      if (page.isClosed()) page = await context.newPage();
      const left = deadline - Date.now();
      await withTimeout(step.run(page), Math.min(step.maxMs || 90000, Math.max(8000, left)), step.label);
      visited++;
    } catch (e) { /* timeout/erro de uma etapa não derruba o aquecimento */ }
    try { await dwell(1000, 2400); } catch (e) {}
    i++;
  }
  return { visited, total: plan.length };
}

module.exports = { warmUp, TASKS, buildJourney, measureWarmth };
