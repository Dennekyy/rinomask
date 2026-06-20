'use strict';
// Teste PURO (sem motor/rede) do conteúdo de aquecimento: pickPool por locale × nicho +
// scoreWarmth determinístico. Garante a COERÊNCIA de locale (o coração da Fase 1) e que o
// scoring é estável/recalibrado. Rodar: node scripts/test-warm-content.js
const { pickPool, normalizeLocale, scoreWarmth, resolveIntensity, avoidFilter } = require('../src/warmContent');

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const has = (arr, sub) => arr.some((s) => s.toLowerCase().includes(sub.toLowerCase()));
const none = (arr, sub) => !arr.some((s) => s.toLowerCase().includes(sub.toLowerCase()));

console.log('\n[1] pickPool: sempre devolve um pool completo');
for (const [loc, nic] of [['pt-BR', 'crypto'], ['en-US', 'default'], ['es-ES', 'tiktok'], ['en-GB', 'facebook']]) {
  const p = pickPool(loc, nic);
  check(`pool ${loc}/${nic} tem q/vq/sites/engine/locale`,
    Array.isArray(p.q) && p.q.length > 0 && Array.isArray(p.vq) && p.vq.length > 0 &&
    Array.isArray(p.sites) && p.sites.length > 0 && !!p.engine && !!p.locale);
}

console.log('\n[2] Coerência de locale (conteúdo no idioma/país certo)');
const ptCrypto = pickPool('pt-BR', 'crypto');
check('pt-BR/crypto usa termos PT + Binance pt-BR', has(ptCrypto.q, 'preço') && has(ptCrypto.q, 'bitcoin') && /binance\.com\/pt/i.test(ptCrypto.home || ''), ptCrypto.home);
const enCrypto = pickPool('en-US', 'crypto');
check('en-US/crypto usa termos EN (sem "preço") + Binance /en', has(enCrypto.q, 'price') && none(enCrypto.q, 'preço') && /binance\.com\/en/i.test(enCrypto.home || ''), enCrypto.home);
const esDefault = pickPool('es-ES', 'default');
check('es-ES/default lê sites espanhóis (elpais/elmundo)', has(esDefault.sites, 'elpais') || has(esDefault.sites, 'elmundo'));
check('en-US/default NÃO usa g1.globo.com (seria incoerente)', none(pickPool('en-US', 'default').sites, 'g1.globo'));
check('en-GB/default lê sites britânicos (bbc.co.uk/guardian)', has(pickPool('en-GB', 'default').sites, 'bbc.co.uk') || has(pickPool('en-GB', 'default').sites, 'theguardian'));

console.log('\n[3] Fallbacks (locale/idioma/nicho)');
check('locale desconhecido cai em pt-BR', normalizeLocale('xx-YY') === 'pt-BR');
check('pt-PT (mesmo idioma) cai em pt-BR', normalizeLocale('pt-PT') === 'pt-BR');
check('es-419 (mesmo idioma) cai em es-ES', normalizeLocale('es-419') === 'es-ES');
check('nicho desconhecido vira default', pickPool('en-US', 'naoexiste').niche === 'default');
check('locale vazio vira pt-BR', pickPool('', 'crypto').locale === 'pt-BR');
check('nicho herda engine do default da locale', pickPool('es-ES', 'crypto').engine === 'google');

console.log('\n[4] scoreWarmth determinístico (recalibrado v2, 0–100)');
check('scoreWarmth(undefined) = 0', scoreWarmth() === 0);
check('scoreWarmth({}) = 0', scoreWarmth({}) === 0);
const fixed = { cookies: 20, domains: 6, thirdParty: 5, persistent: 10, tlds: 4, localStorage: 3, indexedDB: 1, visited: 4 };
check('scoreWarmth(entrada fixa) = 52 (estável)', scoreWarmth(fixed) === 52, String(scoreWarmth(fixed)));
check('scoreWarmth satura em 100', scoreWarmth({ cookies: 9999, domains: 9999, thirdParty: 9999, persistent: 9999, tlds: 9999, localStorage: 1, indexedDB: 1, visited: 9999 }) === 100);
const low = scoreWarmth({ cookies: 5, domains: 2 });
const high = scoreWarmth({ cookies: 25, domains: 10, thirdParty: 8 });
check('mais sinais → score maior (monotônico)', high > low, `${low} < ${high}`);

console.log('\n[5] Intensidade (Fase 3): presets de duração');
check('leve ≈ 2 min', resolveIntensity('leve').budgetMs === 120000);
check('médio ≈ 4 min', resolveIntensity('medio').budgetMs === 240000);
check('profundo ≈ 9 min', resolveIntensity('profundo').budgetMs === 540000);
check('desconhecido/vazio cai em médio (default)', resolveIntensity('xxx').budgetMs === 240000 && resolveIntensity().budgetMs === 240000);
check('preset expõe key', resolveIntensity('leve').key === 'leve');

console.log('\n[6] Variedade entre execuções (Fase 3): avoidFilter');
const sites = ['https://g1.globo.com/', 'https://www.uol.com.br/', 'https://www.cnnbrasil.com.br/'];
const filtered = avoidFilter(sites, ['g1.globo.com']);
check('remove host recém-visitado', filtered.length === 2 && none(filtered, 'g1.globo'));
check('ignora prefixo www no avoid', avoidFilter(sites, ['www.uol.com.br']).length === 2);
check('cai na lista cheia se tudo foi evitado', avoidFilter(sites, ['g1.globo.com', 'uol.com.br', 'cnnbrasil.com.br']).length === 3);
check('avoid vazio mantém a lista', avoidFilter(sites, []).length === 3 && avoidFilter(sites).length === 3);

console.log(`\n  RESULTADO: ${pass} passou, ${fail} falhou`);
process.exit(fail === 0 ? 0 : 1);
