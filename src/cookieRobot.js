'use strict';

// Cookie Robot — aquecimento ATIVO, humano e ALEATÓRIO do perfil.
// O navegador pesquisa, clica em resultados, ASSISTE vídeos no YouTube, explora mapas e
// navega por dezenas de sites — acumulando cookies/cache/histórico legítimos, como um
// usuário real. Não importa cookies de terceiros (isso contaminaria a identidade do perfil).

const { rand, sleep, dwell, humanType, humanScroll, clickMaybe } = require('./humanInput');

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((p) => p[1]);
const chance = (p) => Math.random() < p;

// Pools (pt-BR) variados.
const QUERIES = [
  'notícias de hoje', 'previsão do tempo', 'receita de bolo de cenoura', 'cotação do dólar',
  'como economizar energia em casa', 'melhores séries 2026', 'resultado do brasileirão',
  'horário de verão', 'tabela periódica', 'quanto custa um carro elétrico', 'frases motivacionais',
  'melhores praias do nordeste', 'como fazer pão caseiro', 'curiosidades sobre o espaço',
  'significado dos sonhos', 'preço do bitcoin hoje', 'feriados 2026', 'qual o maior animal do mundo',
];
const VIDEO_Q = [
  'música para relaxar', 'documentário natureza 4k', 'treino em casa 20 minutos', 'lo-fi para estudar',
  'notícias da semana resumo', 'receitas fáceis e rápidas', 'show ao vivo completo', 'podcast tecnologia',
  'tutorial violão iniciante', 'viagem mochilão europa', 'comédia stand up brasil', 'gameplay relaxante',
];
const PLACES = [
  'restaurantes perto de mim', 'farmácia 24 horas', 'padaria no centro', 'shopping',
  'posto de gasolina', 'academia perto de mim', 'hospital mais próximo', 'cafeteria', 'parque', 'mercado',
];

// 30+ sites para a tarefa "browse" (notícias, referência, e-commerce, esporte, tech, entretenimento).
const SITES = [
  'https://pt.wikipedia.org/wiki/Brasil', 'https://pt.wikipedia.org/wiki/Especial:Aleat%C3%B3ria',
  'https://www.uol.com.br/', 'https://g1.globo.com/', 'https://www.cnnbrasil.com.br/',
  'https://www.bbc.com/portuguese', 'https://www.terra.com.br/', 'https://www.estadao.com.br/',
  'https://www.folha.uol.com.br/', 'https://www.metropoles.com/', 'https://www.r7.com/',
  'https://www.mercadolivre.com.br/', 'https://www.amazon.com.br/', 'https://www.magazineluiza.com.br/',
  'https://www.americanas.com.br/', 'https://www.casasbahia.com.br/',
  'https://www.ge.globo.com/', 'https://www.espn.com.br/', 'https://www.lance.com.br/',
  'https://tecnoblog.net/', 'https://www.tecmundo.com.br/', 'https://canaltech.com.br/', 'https://olhardigital.com.br/',
  'https://www.adorocinema.com/', 'https://www.imdb.com/', 'https://www.reclameaqui.com.br/',
  'https://www.climatempo.com.br/', 'https://www.tempo.com/', 'https://www.infomoney.com.br/',
  'https://www.b3.com.br/pt_br/', 'https://www.gov.br/pt-br', 'https://www.poupatempo.sp.gov.br/',
  'https://www.netflix.com/br/', 'https://www.globo.com/', 'https://www.ig.com.br/',
  'https://en.wikipedia.org/wiki/Special:Random', 'https://www.reddit.com/', 'https://medium.com/',
];

// ---- Consentimento (cookies) robusto: selectors conhecidos + texto + iframes ----
const CONSENT_SELECTORS = [
  '#onetrust-accept-btn-handler', 'button#L2AGLb', '#bnp_btn_accept', '#sb_form_go',
  '.fc-cta-consent', '#accept-choices', '[data-testid="accept-button"]',
  'button[aria-label*="Accept" i]', 'button[aria-label*="Aceitar" i]', 'button[mode="primary"]',
  '#didomi-notice-agree-button', '.css-47sehv', 'button[title*="Aceitar" i]',
  'button[aria-label*="aceitar tudo" i]', 'tp-yt-paper-button[aria-label*="Aceitar" i]',
];
const ACCEPT_TEXT = /^(aceitar tudo|aceitar todos|aceitar e fechar|aceitar|aceito|concordo|prosseguir|entendi|ok,? entendi|allow all|accept all|accept|i agree|agree|got it|allow|continuar|sim, aceito)$/i;

async function acceptConsent(page) {
  await sleep(rand(900, 1800));
  for (const fr of page.frames()) {
    for (const sel of CONSENT_SELECTORS) {
      try { if (await fr.locator(sel).count()) { if (await clickMaybe(fr, fr.locator(sel))) { await sleep(700); return true; } } } catch (e) {}
    }
    try {
      const btns = fr.getByRole('button');
      const n = Math.min(await btns.count().catch(() => 0), 40);
      for (let i = 0; i < n; i++) {
        const t = (await btns.nth(i).innerText().catch(() => '')).trim();
        if (t && ACCEPT_TEXT.test(t)) { await btns.nth(i).click({ timeout: 3000 }).catch(() => {}); await sleep(700); return true; }
      }
    } catch (e) {}
  }
  return false;
}

async function goto(page, url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 }); return true; }
    catch (e) { await sleep(1200); }
  }
  return false;
}

// ---- YouTube: garante reprodução e "assiste" por um tempo, com interações ----
async function ensurePlaying(page) {
  await dwell(2500, 4500); // deixa o player carregar (pode haver anúncio)
  try {
    const playing = await page.evaluate(() => { const v = document.querySelector('video'); return !!(v && !v.paused && v.currentTime > 0); }).catch(() => false);
    if (!playing) {
      const btn = page.locator('.ytp-play-button, .ytp-large-play-button').first();
      if (await btn.count().catch(() => 0)) await btn.click({ timeout: 3000 }).catch(() => {});
      else await page.keyboard.press('k').catch(() => {});
    }
  } catch (e) {}
}
async function watchVideo(page, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await sleep(rand(4000, 9000));
    if (chance(0.4)) await humanScroll(page, rand(1, 2)); // dá uma olhada nos comentários
    if (chance(0.25)) await page.mouse.move(rand(200, 900), rand(150, 600)).catch(() => {}); // mexe o cursor
  }
}

// ---- Receitas por site (ações ativas, todas com aleatoriedade) ----
const TASKS = {
  async google(page) {
    await goto(page, 'https://www.google.com/');
    await acceptConsent(page);
    const box = page.locator('textarea[name="q"], input[name="q"]');
    if (!(await box.count().catch(() => 0))) return;
    await humanType(page, box, pick(QUERIES));
    await dwell(400, 1100);
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await dwell(2000, 4000);
    await humanScroll(page, rand(2, 5));
    if (chance(0.85) && await clickMaybe(page, page.locator('#search a:has(h3), #rso a:has(h3)'))) {
      await dwell(3000, 7000); await humanScroll(page, rand(2, 5));
    }
  },
  async youtube(page) {
    await goto(page, 'https://www.youtube.com/');
    await acceptConsent(page);
    await dwell(1500, 3000);
    const box = page.locator('input#search, ytd-searchbox input, input[name="search_query"]');
    if (await box.count().catch(() => 0)) {
      await humanType(page, box, pick(VIDEO_Q));
      await dwell(300, 800);
      await page.keyboard.press('Enter').catch(() => {});
      // resultados carregam via SPA (sem navegação) → espera o renderer aparecer
      await page.waitForSelector('ytd-video-renderer, ytd-rich-item-renderer, a#video-title', { timeout: 12000 }).catch(() => {});
      await dwell(1500, 3000);
      await humanScroll(page, rand(1, 3));
    }
    // clica num vídeo (prioriza títulos de resultados; fallback p/ thumbnail)
    let opened = await clickMaybe(page, page.locator('ytd-video-renderer a#video-title, a#video-title, ytd-rich-item-renderer a#video-title-link').first());
    if (!opened) opened = await clickMaybe(page, page.locator('a#thumbnail:has(img), ytd-thumbnail a').first());
    if (opened) {
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await ensurePlaying(page);
      await watchVideo(page, rand(25000, 75000)); // assiste 25–75s
      // às vezes clica num vídeo recomendado e assiste mais um pouco
      if (chance(0.4) && await clickMaybe(page, page.locator('ytd-compact-video-renderer a#thumbnail, a.ytp-videowall-still').first())) {
        await ensurePlaying(page);
        await watchVideo(page, rand(15000, 40000));
      }
    }
  },
  async bing(page) {
    await goto(page, 'https://www.bing.com/');
    await acceptConsent(page);
    const box = page.locator('#sb_form_q, textarea[name="q"], input[name="q"]');
    if (!(await box.count().catch(() => 0))) return;
    await humanType(page, box, pick(QUERIES));
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await dwell(2000, 4000); await humanScroll(page, rand(2, 4));
    if (chance(0.6) && await clickMaybe(page, page.locator('#b_results h2 a').first())) {
      await dwell(2500, 5500); await humanScroll(page, rand(2, 4));
    }
  },
  async maps(page) {
    await goto(page, 'https://www.google.com/maps');
    await acceptConsent(page);
    const box = page.locator('#searchboxinput, input#searchboxinput');
    if (!(await box.count().catch(() => 0))) return;
    await humanType(page, box, pick(PLACES));
    await page.keyboard.press('Enter').catch(() => {});
    await dwell(4000, 7000); await humanScroll(page, rand(1, 3));
    if (chance(0.7) && await clickMaybe(page, page.locator('a.hfpxzc, div[role="article"] a, div[role="feed"] a').first())) {
      await dwell(4000, 8000); await humanScroll(page, rand(1, 3));
    }
  },
  async browse(page) {
    await goto(page, pick(SITES));
    await acceptConsent(page);
    await dwell(2000, 4500); await humanScroll(page, rand(3, 8));
    // navega para um link interno e lê mais um pouco (às vezes dois níveis)
    const depth = rand(1, 2);
    for (let d = 0; d < depth; d++) {
      if (await clickMaybe(page, page.locator('main a[href]:visible, article a[href]:visible, #content a[href]:visible, a[href^="/"]:visible').first())) {
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await dwell(2500, 6000); await humanScroll(page, rand(2, 5));
      } else break;
    }
  },
};

// Monta um plano de aquecimento ALEATÓRIO: tamanho variável e mistura ponderada de tarefas
// (browse domina p/ variar os sites; busca/YouTube/maps entram com frequências diferentes).
function buildPlan(tasks) {
  if (tasks && tasks.length) return tasks.filter((k) => TASKS[k]).map((k) => ({ label: k, run: TASKS[k] }));
  const weighted = ['google', 'google', 'youtube', 'youtube', 'bing', 'maps', 'browse', 'browse', 'browse', 'browse', 'browse'];
  const n = rand(8, 14);
  const plan = [];
  let last = null;
  for (let i = 0; i < n; i++) {
    let k, guard = 0;
    do { k = pick(weighted); guard++; } while (k === last && k !== 'browse' && guard < 6); // evita 2 buscas idênticas seguidas
    last = k; plan.push(k);
  }
  // garante ao menos 1 YouTube no plano (o usuário quer ver vídeos sendo assistidos)
  if (!plan.includes('youtube')) plan[rand(0, plan.length - 1)] = 'youtube';
  return plan.map((k) => ({ label: k, run: TASKS[k] }));
}

// Mede a maturidade/qualidade do perfil aquecido a partir do estado real do contexto.
async function measureWarmth(context, visited) {
  let cookies = [];
  try { cookies = await context.cookies(); } catch (e) {}
  const domains = new Set(cookies.map((c) => String(c.domain || '').replace(/^\./, '')).filter(Boolean)).size;
  const c = Math.min(50, cookies.length * 0.7); // volume de cookies (≈71 = 50 pts)
  const d = Math.min(35, domains * 2.2);         // diversidade de domínios (≈16 = 35 pts)
  const v = Math.min(15, (visited || 0) * 1.5);  // sites percorridos (10 = 15 pts)
  return { score: Math.round(c + d + v), cookies: cookies.length, domains, visited: visited || 0 };
}

// Aquece um perfil já aberto (recebe a Page do Playwright).
async function warmUp(page, { tasks, onProgress } = {}) {
  const plan = buildPlan(tasks);
  const context = page.context();
  let i = 0;
  for (const step of plan) {
    if (onProgress) onProgress({ label: step.label, index: i, total: plan.length });
    try {
      if (page.isClosed()) page = await context.newPage(); // recupera se a página fechou
      await step.run(page);
    } catch (e) { /* uma tarefa falhar não derruba o aquecimento */ }
    try { await dwell(1500, 3500); } catch (e) {}
    i++;
  }
  return { visited: plan.length };
}

module.exports = { warmUp, TASKS, buildPlan, measureWarmth };
