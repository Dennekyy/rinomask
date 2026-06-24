'use strict';
// Extraído de electron/main.js para ser testável fora do processo Electron principal
// (scripts/test-*.js) sem duplicar a logica real usada pelo app — main.js e os scripts de
// teste chamam exatamente o mesmo codigo, so injetando emit/notifyChanged diferentes.
const { resolveIntensity } = require('./warmContent');

function createWarmer({ store, launcher, cookieRobot, errorLog, emit, notifyChanged }) {
  // Garante que o perfil está aberto e retorna a página principal.
  async function ensureLaunched(id) {
    if (!launcher.isRunning(id)) {
      const prof = store.getProfile(id);
      if (!prof) return null;
      await launcher.launchAutomation(prof, { headless: true });
      store.markLaunched(id);
      notifyChanged();
    }
    return launcher.getPage(id); // null se o perfil estiver aberto no modo manual
  }

  // Aquece um perfil EM SEGUNDO PLANO (headless, sem janela) por padrão — o usuário não precisa
  // abrir nada. opts.show abre a janela do navegador para acompanhar. Executa o Cookie Robot,
  // mede a maturidade (cookies/domínios/sites) e FECHA o navegador ao terminar.
  async function warmProfile(id, opts) {
    const prof = store.getProfile(id);
    if (!prof) { emit('warm:done', { id, error: 'perfil não encontrado' }); return; }
    const wasRunning = launcher.isRunning(id);
    if (wasRunning && launcher.kindOf(id) !== 'pw') { emit('warm:done', { id, error: 'feche o navegador (modo manual) antes de aquecer' }); return; }
    let launchedByRobot = false;
    const intensity = resolveIntensity(opts && opts.intensity);
    const targetScore = opts && typeof opts.targetScore === 'number' ? opts.targetScore : null;
    const BUDGET = intensity.budgetMs;
    let killer = null;
    try {
      if (!wasRunning) {
        const headless = !(opts && opts.show);
        await launcher.launchAutomation(prof, { headless });
        launchedByRobot = true;
        store.markLaunched(id);
        notifyChanged();
        killer = setTimeout(() => { launcher.stop(id).catch(() => {}); }, BUDGET + 120000);
      }
      const page = await launcher.getPage(id);
      if (!page) { emit('warm:done', { id, error: 'sem página disponível' }); return; }
      emit('warm:start', { id });
      const HARD = BUDGET + 60000;
      const fp = prof.fingerprint || {};
      const avoid = (prof.warmHistory && Array.isArray(prof.warmHistory.domains)) ? prof.warmHistory.domains : [];
      const result = await Promise.race([
        (async () => {
          const r = await cookieRobot.warmUp(page, { niche: prof.mainWebsite, locale: fp.locale, region: fp.timezone, budgetMs: BUDGET, targetScore, avoid, onProgress: (pr) => emit('warm:progress', { id, ...pr }) });
          let w = null; try { w = await cookieRobot.measureWarmth(page.context(), r.visited, page); } catch (e) {}
          return { r, w };
        })(),
        new Promise((res) => setTimeout(() => res('__timeout__'), HARD)),
      ]);
      if (result === '__timeout__') {
        emit('warm:done', { id, error: 'tempo limite atingido — encerrado' });
      } else {
        const at = new Date().toISOString();
        if (result.w) store.setWarmth(id, { ...result.w, at });
        const report = { v: 2, at, intensity: intensity.key, ...result.r.report, warmth: result.w || null };
        store.setWarmReport(id, report);
        store.setWarmVisited(id, result.r.report.visitedDomains);
        emit('warm:done', { id, visited: result.r.visited, warmth: result.w ? result.w.score : 0, report });
      }
    } catch (e) {
      errorLog.log({ source: 'cookieRobot', message: e && e.message, stack: e && e.stack, context: { id } });
      emit('warm:done', { id, error: e && e.message });
    } finally {
      if (killer) clearTimeout(killer);
      if (launchedByRobot) await launcher.stop(id).catch(() => {});
      notifyChanged();
    }
  }

  // Aquece vários perfis: pool de concorrência configurável (default 1, teto 3) para
  // equilibrar velocidade × memória — cada perfil abre seu próprio navegador.
  async function runManyWarm({ ids, intensity, targetScore, concurrency, show } = {}) {
    const queue = Array.isArray(ids) ? ids.slice() : [];
    const conc = Math.max(1, Math.min(3, Number(concurrency) || 1));
    const opts = { intensity, targetScore, show };
    const worker = async () => { while (queue.length) { const id = queue.shift(); await warmProfile(id, opts); } };
    await Promise.all(Array.from({ length: Math.min(conc, queue.length) }, () => worker()));
  }

  return { ensureLaunched, warmProfile, runManyWarm };
}

module.exports = { createWarmer };
