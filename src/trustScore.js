'use strict';

// Trust score — auto-teste de "quão indetectável" o perfil está.
// Roda uma bateria de checagens dentro da página do perfil (vetores que
// Meta/Google e anti-bots usam) e devolve uma nota 0–100 + o detalhamento.
// Foca em sinais de AUTOMAÇÃO e COERÊNCIA (o IP/proxy é coberto à parte).

async function evaluate(page) {
  return page.evaluate(async () => {
    const out = [];
    const add = (name, ok, weight, detail) => out.push({ name, ok: !!ok, weight, detail: detail || '' });
    const native = (fn) => { try { return fn.toString().includes('[native code]'); } catch (e) { return false; } };

    add('navigator.webdriver ausente', !navigator.webdriver, 15, 'webdriver=' + navigator.webdriver);

    let hcNative = false;
    try { const d = Object.getOwnPropertyDescriptor(Navigator.prototype, 'hardwareConcurrency'); hcNative = !!(d && d.get && native(d.get)); } catch (e) {}
    add('getter de hardwareConcurrency é nativo', hcNative, 10);

    add('canvas toDataURL nativo (sem hook JS)', native(HTMLCanvasElement.prototype.toDataURL), 10);
    add('WebGL getParameter nativo', !!(window.WebGLRenderingContext && native(WebGLRenderingContext.prototype.getParameter)), 10);

    const ua = navigator.userAgent;
    add('User-Agent é Firefox (sem Chrome)', /Firefox\/\d+/.test(ua) && !/Chrome|Chromium/.test(ua), 10, ua.slice(0, 60));

    const plat = navigator.platform;
    const okPlat = (/Windows/.test(ua) && plat === 'Win32') || (/Mac/.test(ua) && plat === 'MacIntel') || (/Linux/.test(ua) && /Linux/.test(plat));
    add('platform coerente com o UA', okPlat, 10, plat);

    add('navigator.languages preenchido', Array.isArray(navigator.languages) && navigator.languages.length > 0, 5, (navigator.languages || []).join(','));

    const autoKeys = ['cdc_adoQpoasnfa76pfcZLmcfl_Array', '_phantom', '__nightmare', '__selenium_unwrapped', 'domAutomation', '__webdriver_evaluate', '__driver_evaluate'];
    const dirty = autoKeys.filter((k) => (k in window) || (typeof document !== 'undefined' && k in document));
    add('sem variáveis globais de automação', dirty.length === 0, 10, dirty.join(',') || 'limpo');

    let permOk = false;
    try { const p = await navigator.permissions.query({ name: 'notifications' }); permOk = !!p && typeof p.state === 'string'; } catch (e) {}
    add('Permissions API coerente', permOk, 5);

    let glInfo = '';
    try { const g = document.createElement('canvas').getContext('webgl'); const e = g.getExtension('WEBGL_debug_renderer_info'); glInfo = e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) {}
    add('WebGL exposto (não bloqueado)', !!glInfo, 5, glInfo);

    let workerHc = null;
    try {
      const url = URL.createObjectURL(new Blob(['self.postMessage(navigator.hardwareConcurrency)'], { type: 'text/javascript' }));
      workerHc = await new Promise((res) => { const w = new Worker(url); const t = setTimeout(() => res('timeout'), 3500); w.onmessage = (ev) => { clearTimeout(t); res(ev.data); w.terminate(); }; });
      URL.revokeObjectURL(url);
    } catch (e) {}
    add('Web Worker coerente com a thread principal', workerHc === navigator.hardwareConcurrency, 10, 'worker=' + workerHc + ' main=' + navigator.hardwareConcurrency);

    const total = out.reduce((s, c) => s + c.weight, 0);
    const got = out.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
    return { score: Math.round((got / total) * 100), checks: out };
  });
}

module.exports = { evaluate };
