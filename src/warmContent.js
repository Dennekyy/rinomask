'use strict';

// Conteúdo de aquecimento COERENTE com o locale/região do perfil.
// Sem isto, um perfil "US" aqueceria com "cotação do dólar" + g1.globo.com — incoerente e
// detectável (fere o valor central do produto). Aqui cada locale tem pools de busca, vídeo e
// leitura no idioma/país certo, com sobreposição por nicho (cripto/facebook/tiktok/google).
//
// Forma de um pool: { q: [buscas], vq: [buscas de vídeo], sites: [URLs de leitura],
//                     engine: 'google'|'bing', home: URL do destino do nicho | null }
// pickPool(locale, niche) resolve com fallback: niche→default da locale; locale→idioma→pt-BR.

// ---- Conteúdo genérico por locale (nicho "default") + sobreposições por nicho ----
const LOCALES = {
  'pt-BR': {
    default: {
      engine: 'google',
      q: ['notícias de hoje', 'previsão do tempo', 'cotação do dólar', 'melhores séries 2026', 'curiosidades sobre o espaço', 'receita de bolo de cenoura', 'resultado do brasileirão'],
      vq: ['música para relaxar', 'documentário natureza 4k', 'notícias da semana resumo', 'lo-fi para estudar', 'podcast tecnologia'],
      sites: ['https://g1.globo.com/', 'https://www.uol.com.br/', 'https://www.cnnbrasil.com.br/', 'https://pt.wikipedia.org/wiki/Especial:Aleat%C3%B3ria', 'https://www.bbc.com/portuguese'],
      home: null,
    },
    google: { home: 'https://www.google.com/' },
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
  },

  'en-US': {
    default: {
      engine: 'google',
      q: ['news today', 'weather forecast', 'stock market today', 'best tv shows 2026', 'facts about space', 'easy dinner recipes', 'nfl scores'],
      vq: ['relaxing music', 'nature documentary 4k', 'weekly news recap', 'lofi to study', 'technology podcast'],
      sites: ['https://www.cnn.com/', 'https://www.nytimes.com/', 'https://www.usatoday.com/', 'https://en.wikipedia.org/wiki/Special:Random', 'https://www.bbc.com/news'],
      home: null,
    },
    google: { home: 'https://www.google.com/' },
    facebook: {
      q: ['news today', 'memes of the day', 'easy recipes', 'local marketplace deals'],
      vq: ['weekly news recap', 'easy quick recipes', 'relaxing music'],
      sites: ['https://www.cnn.com/', 'https://www.usatoday.com/', 'https://www.buzzfeed.com/'],
      home: 'https://www.facebook.com/',
    },
    tiktok: {
      q: ['tiktok trends', 'trending songs', 'viral challenges', 'viral dance'],
      vq: ['trending music 2026', 'stand up comedy', 'relaxing gameplay'],
      sites: ['https://www.rottentomatoes.com/', 'https://genius.com/', 'https://www.theverge.com/'],
      home: 'https://www.tiktok.com/',
    },
    crypto: {
      q: ['bitcoin price today', 'what is blockchain', 'how to invest in crypto', 'ethereum price'],
      vq: ['bitcoin analysis today', 'what is blockchain explained', 'crypto news this week'],
      sites: ['https://www.coindesk.com/', 'https://cointelegraph.com/', 'https://www.investing.com/crypto/'],
      home: 'https://www.binance.com/en',
    },
  },

  'en-GB': {
    default: {
      engine: 'google',
      q: ['news today uk', 'weather forecast', 'premier league table', 'best tv shows 2026', 'facts about space', 'easy dinner recipes', 'train times'],
      vq: ['relaxing music', 'nature documentary 4k', 'weekly news recap uk', 'lofi to study', 'technology podcast'],
      sites: ['https://www.bbc.co.uk/news', 'https://www.theguardian.com/uk', 'https://news.sky.com/', 'https://en.wikipedia.org/wiki/Special:Random', 'https://www.telegraph.co.uk/'],
      home: null,
    },
    google: { home: 'https://www.google.com/' },
    facebook: {
      q: ['news today uk', 'memes of the day', 'easy recipes', 'local marketplace deals'],
      vq: ['weekly news recap uk', 'easy quick recipes', 'relaxing music'],
      sites: ['https://www.bbc.co.uk/news', 'https://www.theguardian.com/uk', 'https://www.ladbible.com/'],
      home: 'https://www.facebook.com/',
    },
    tiktok: {
      q: ['tiktok trends uk', 'trending songs', 'viral challenges', 'viral dance'],
      vq: ['trending music 2026', 'stand up comedy uk', 'relaxing gameplay'],
      sites: ['https://www.rottentomatoes.com/', 'https://genius.com/', 'https://www.nme.com/'],
      home: 'https://www.tiktok.com/',
    },
    crypto: {
      q: ['bitcoin price today', 'what is blockchain', 'how to invest in crypto uk', 'ethereum price'],
      vq: ['bitcoin analysis today', 'what is blockchain explained', 'crypto news this week'],
      sites: ['https://www.coindesk.com/', 'https://cointelegraph.com/', 'https://www.investing.com/crypto/'],
      home: 'https://www.binance.com/en',
    },
  },

  'es-ES': {
    default: {
      engine: 'google',
      q: ['noticias de hoy', 'el tiempo', 'resultados de laliga', 'mejores series 2026', 'curiosidades del espacio', 'recetas fáciles', 'cotización del euro'],
      vq: ['música para relajarse', 'documental naturaleza 4k', 'resumen noticias de la semana', 'lofi para estudiar', 'podcast tecnología'],
      sites: ['https://elpais.com/', 'https://www.elmundo.es/', 'https://www.marca.com/', 'https://es.wikipedia.org/wiki/Especial:Aleatoria', 'https://www.bbc.com/mundo'],
      home: null,
    },
    google: { home: 'https://www.google.com/' },
    facebook: {
      q: ['noticias de hoy', 'memes del día', 'recetas fáciles', 'grupos de venta'],
      vq: ['resumen noticias de la semana', 'recetas fáciles y rápidas', 'música para relajarse'],
      sites: ['https://elpais.com/', 'https://www.elmundo.es/', 'https://www.20minutos.es/'],
      home: 'https://www.facebook.com/',
    },
    tiktok: {
      q: ['tendencias tiktok', 'canciones de moda', 'retos virales', 'baile viral'],
      vq: ['música de moda 2026', 'comedia stand up', 'gameplay relajante'],
      sites: ['https://www.sensacine.com/', 'https://www.letras.com/', 'https://www.xataka.com/'],
      home: 'https://www.tiktok.com/',
    },
    crypto: {
      q: ['precio del bitcoin hoy', 'qué es blockchain', 'cómo invertir en cripto', 'precio ethereum'],
      vq: ['análisis bitcoin hoy', 'qué es blockchain explicado', 'noticias cripto de la semana'],
      sites: ['https://es.cointelegraph.com/', 'https://www.investing.com/crypto/', 'https://www.criptonoticias.com/'],
      home: 'https://www.binance.com/es',
    },
  },
};

const DEFAULT_LOCALE = 'pt-BR';

// Resolve a locale do perfil para uma das suportadas: exata → mesmo idioma → pt-BR.
function normalizeLocale(locale) {
  const l = String(locale || '').trim();
  if (LOCALES[l]) return l;
  const lang = l.split(/[-_]/)[0].toLowerCase();
  if (lang) {
    const sameLang = Object.keys(LOCALES).find((k) => k.toLowerCase().startsWith(lang + '-') || k.toLowerCase() === lang);
    if (sameLang) return sameLang;
  }
  return DEFAULT_LOCALE;
}

// Seleciona o pool coerente para (locale, nicho), herdando do "default" da locale os campos
// que o nicho não sobrescreve. SEMPRE retorna um pool completo (q/vq/sites/engine/home).
function pickPool(locale, niche) {
  const loc = normalizeLocale(locale);
  const table = LOCALES[loc];
  const key = String(niche || '').toLowerCase();
  const base = table.default;
  const hasNiche = !!(key && table[key]);
  const override = hasNiche ? table[key] : {};
  return {
    locale: loc,
    niche: hasNiche ? key : 'default',
    engine: override.engine || base.engine || 'google',
    q: override.q || base.q,
    vq: override.vq || base.vq,
    sites: override.sites || base.sites,
    home: override.home !== undefined ? override.home : base.home,
  };
}

// ---- Scoring de maturidade (v2) — PURO e determinístico (testável sem motor) ----
// Recebe sinais brutos coletados de cookies/storage e devolve um score 0–100. Recompensa
// um perfil que "viveu": muitos cookies, variedade de domínios/TLDs, cookies cross-site
// (3rd-party = navegação real deixa rastros), cookies persistentes e storage local.
function scoreWarmth(s) {
  const sig = s || {};
  const cookies = Math.min(28, (sig.cookies || 0) * 0.5);
  const domains = Math.min(22, (sig.domains || 0) * 2);
  const thirdParty = Math.min(18, (sig.thirdParty || 0) * 1.2); // cookies cross-site (SameSite=None)
  const persistent = Math.min(12, (sig.persistent || 0) * 0.6);
  const tld = Math.min(10, (sig.tlds || 0) * 2);
  const storage = Math.min(6, (sig.localStorage ? 3 : 0) + (sig.indexedDB ? 3 : 0));
  const visited = Math.min(4, (sig.visited || 0) * 1);
  const score = Math.round(cookies + domains + thirdParty + persistent + tld + visited + storage);
  return Math.max(0, Math.min(100, score));
}

// ---- Intensidade (Fase 3): presets de duração do aquecimento ----
// O teto de tempo (BUDGET) é derivado daqui; HARD/killer continuam = BUDGET + margens fixas no
// processo principal, então a garantia de "sempre termina" se mantém em qualquer intensidade.
const INTENSITY = {
  leve: { key: 'leve', budgetMs: 2 * 60 * 1000, label: 'Leve · ~2 min' },
  medio: { key: 'medio', budgetMs: 4 * 60 * 1000, label: 'Médio · ~4 min' },
  profundo: { key: 'profundo', budgetMs: 9 * 60 * 1000, label: 'Profundo · ~9 min' },
};
function resolveIntensity(name) {
  const k = String(name || '').toLowerCase();
  return INTENSITY[k] || INTENSITY.medio;
}

// ---- Variedade entre execuções (Fase 3): evita repetir os mesmos domínios ----
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
// Remove de `urls` as que apontam para um host presente em `avoid`. Se sobrar vazio (tudo já
// foi visitado há pouco), devolve a lista cheia — melhor repetir do que não aquecer.
function avoidFilter(urls, avoid) {
  const set = new Set((avoid || []).map((d) => String(d || '').replace(/^www\./, '')));
  const kept = (urls || []).filter((u) => !set.has(hostOf(u)));
  return kept.length ? kept : (urls || []).slice();
}

module.exports = { pickPool, normalizeLocale, scoreWarmth, LOCALES, DEFAULT_LOCALE, INTENSITY, resolveIntensity, avoidFilter };
