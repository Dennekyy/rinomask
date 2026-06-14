'use strict';

// Auditoria de detecção: junta a bateria LOCAL de coerência com os ORÁCULOS externos
// e devolve um relatório consolidado. A nota geral é a PIOR entre as fontes (um detector
// que te pega vale mais que dez que não pegam).

const { runCoherence } = require('./coherence');
const { ORACLES } = require('./oracles');

async function audit(page, { oracles = ['creepjs'], onProgress } = {}) {
  if (onProgress) onProgress({ stage: 'coherence' });
  const coherence = await runCoherence(page);

  const results = [];
  for (const key of oracles) {
    if (!ORACLES[key]) continue;
    if (onProgress) onProgress({ stage: 'oracle', oracle: key });
    try { results.push(await ORACLES[key](page)); }
    catch (e) { results.push({ name: key, ok: false, error: e && e.message }); }
  }

  const scores = [coherence.score, ...results.filter((r) => typeof r.score === 'number').map((r) => r.score)];
  const overall = scores.length ? Math.min(...scores) : coherence.score;
  return { overall, coherence, oracles: results, at: new Date().toISOString() };
}

module.exports = { audit, runCoherence };
