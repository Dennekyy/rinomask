'use strict';

// Bateria LOCAL de coerência / "lie detection" (técnica do CreepJS, rodando offline).
// Em vez de só checar alguns vetores isolados, procura o navegador se CONTRADIZENDO:
// UA x plataforma x engine x tela x WebGL x fuso, getters não-nativos, instabilidade de
// canvas/WebGL, artefatos de automação. Cada "lie" é um sinal forte de fingerprint forjada.
// Devolve { score 0-100, checks:[{name, ok, lie, weight, detail}], lies:[nomes] }.

async function runCoherence(page) {
  const report = await page.evaluate(async () => {
    const checks = [];
    // weight = peso na nota; lie = contradição séria (entra na lista de "mentiras")
    const add = (name, ok, weight, lie, detail) => checks.push({ name, ok: !!ok, weight, lie: !!lie, detail: detail == null ? '' : String(detail).slice(0, 90) });
    const isNative = (fn) => { try { return /\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(fn)); } catch (e) { return false; } };
    const ua = navigator.userAgent || '';
    const isWin = /Windows/.test(ua), isMac = /Macintosh|Mac OS X/.test(ua), isLin = /Linux|X11/.test(ua) && !/Android/.test(ua);

    // ---- 1. Artefatos diretos de automação ----
    add('navigator.webdriver = false', navigator.webdriver === false || navigator.webdriver == null, 12, navigator.webdriver === true, 'webdriver=' + navigator.webdriver);
    const autoKeys = ['cdc_adoQpoasnfa76pfcZLmcfl_Array', '_phantom', '__nightmare', '__selenium_unwrapped', 'domAutomation', '__webdriver_evaluate', '__driver_evaluate', '__playwright', '__puppeteer', 'callPhantom'];
    const dirty = autoKeys.filter((k) => (k in window) || (typeof document !== 'undefined' && k in document));
    add('sem globais de automação', dirty.length === 0, 10, dirty.length > 0, dirty.join(',') || 'limpo');

    // ---- 2. Engine REALMENTE é Firefox/Gecko (não Chromium fingindo) ----
    const geckoMarkers = ('mozInnerScreenX' in window) && (typeof InstallTrigger !== 'undefined' || CSS.supports('-moz-appearance', 'none'));
    add('engine é Gecko/Firefox de verdade', geckoMarkers, 12, /Firefox/.test(ua) && !geckoMarkers, 'mozInnerScreenX=' + ('mozInnerScreenX' in window));
    add('sem window.chrome (Chromium)', typeof window.chrome === 'undefined', 8, typeof window.chrome !== 'undefined' && /Firefox/.test(ua));
    add('sem navigator.userAgentData (Chromium)', typeof navigator.userAgentData === 'undefined', 8, typeof navigator.userAgentData !== 'undefined' && /Firefox/.test(ua));
    add('navigator.pdfViewerEnabled = true (Firefox)', navigator.pdfViewerEnabled === true, 4, false);

    // ---- 3. Getters nativos (sem hook JS visível) ----
    const protoNative = (proto, prop) => { try { const d = Object.getOwnPropertyDescriptor(proto, prop); return !!(d && d.get && isNative(d.get)); } catch (e) { return false; } };
    add('getter hardwareConcurrency nativo', protoNative(Navigator.prototype, 'hardwareConcurrency'), 8, false);
    add('getter userAgent nativo', protoNative(Navigator.prototype, 'userAgent'), 8, false);
    add('canvas.toDataURL nativo', isNative(HTMLCanvasElement.prototype.toDataURL), 8, false);
    add('WebGL.getParameter nativo', !!(window.WebGLRenderingContext && isNative(WebGLRenderingContext.prototype.getParameter)), 8, false);
    add('Function.toString não-adulterado', isNative(Function.prototype.toString), 8, !isNative(Function.prototype.toString));

    // ---- 4. UA x plataforma x oscpu (coerência de SO) ----
    const plat = navigator.platform || '';
    const platOk = (isWin && plat === 'Win32') || (isMac && plat === 'MacIntel') || (isLin && /Linux/.test(plat));
    add('platform coerente com o UA', platOk, 10, !platOk, plat);
    const oscpu = navigator.oscpu || '';
    const oscpuOk = !oscpu || (isWin && /Windows/.test(oscpu)) || (isMac && /Mac/.test(oscpu)) || (isLin && /Linux/.test(oscpu));
    add('oscpu coerente com o UA', oscpuOk, 6, !oscpuOk, oscpu || '(vazio)');
    add('maxTouchPoints=0 no desktop', navigator.maxTouchPoints === 0, 4, navigator.maxTouchPoints > 0 && (isWin || isMac || isLin), 'mtp=' + navigator.maxTouchPoints);

    // ---- 5. Idiomas x fuso (coerência interna; o proxy-geo é checado à parte) ----
    add('navigator.languages preenchido', Array.isArray(navigator.languages) && navigator.languages.length > 0, 5, false, (navigator.languages || []).join(','));
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    const offMatch = (() => { try { const now = new Date(); const inTz = new Date(now.toLocaleString('en-US', { timeZone: tz })); return Math.abs((now - inTz) / 60000) < 24 * 60; } catch (e) { return false; } })();
    add('fuso (Intl) consistente com Date', !!tz && offMatch, 8, !!tz && !offMatch, tz);

    // ---- 6. Tela com dimensões plausíveis (sem impossibilidades) ----
    // Só avalia se a janela está "realizada" (outerWidth>0); em about:blank/headless cru as
    // dimensões podem vir zeradas e isso não é uma mentira de fingerprint.
    const s = screen;
    const realized = window.outerWidth > 0 && s.width > 0;
    const screenSane = !realized || (s.availWidth <= s.width && s.availHeight <= s.height &&
      window.innerWidth <= window.outerWidth + 1 && window.outerWidth <= s.width + 1 && s.colorDepth >= 24);
    add('tela com dimensões coerentes', screenSane, 8, realized && !screenSane, `${s.width}x${s.height} avail ${s.availWidth}x${s.availHeight} inner ${window.innerWidth} outer ${window.outerWidth}`);
    add('devicePixelRatio plausível', window.devicePixelRatio >= 0.5 && window.devicePixelRatio <= 4, 3, false, String(window.devicePixelRatio));

    // ---- 7. WebGL exposto e coerente com o SO (sem render de software) ----
    let glVendor = '', glRenderer = '';
    try {
      const g = document.createElement('canvas').getContext('webgl') || document.createElement('canvas').getContext('experimental-webgl');
      const e = g && g.getExtension('WEBGL_debug_renderer_info');
      if (e) { glVendor = g.getParameter(e.UNMASKED_VENDOR_WEBGL) || ''; glRenderer = g.getParameter(e.UNMASKED_RENDERER_WEBGL) || ''; }
    } catch (e) {}
    add('WebGL exposto (não bloqueado)', !!glRenderer, 5, false, glRenderer);
    const software = /swiftshader|llvmpipe|software|mesa offscreen/i.test(glRenderer);
    add('GPU não é render de software', !!glRenderer && !software, 8, software, glRenderer.slice(0, 50));
    const gpuOsOk = !glRenderer || !((isWin && /apple/i.test(glRenderer)) || (isMac && /(nvidia|direct3d|angle.*radeon)/i.test(glRenderer)));
    add('GPU coerente com o SO', gpuOsOk, 6, !gpuOsOk, glVendor);

    // ---- 8. Estabilidade: canvas e WebGL idênticos em 2 leituras (spoof ingênuo randomiza) ----
    const canvasHash = () => { try { const c = document.createElement('canvas'); c.width = 200; c.height = 50; const x = c.getContext('2d'); x.textBaseline = 'top'; x.font = "14px 'Arial'"; x.fillStyle = '#069'; x.fillText('RinoMask ✨ 0123', 2, 2); x.fillStyle = 'rgba(102,200,0,0.7)'; x.fillText('RinoMask ✨ 0123', 4, 17); return c.toDataURL(); } catch (e) { return 'err' + Math.random(); } };
    const c1 = canvasHash(), c2 = canvasHash();
    add('canvas estável entre leituras', c1 === c2, 8, c1 !== c2, c1 === c2 ? 'estável' : 'VARIOU');
    const glParam = () => { try { const g = document.createElement('canvas').getContext('webgl'); return [g.getParameter(g.MAX_TEXTURE_SIZE), g.getParameter(g.MAX_RENDERBUFFER_SIZE), g.getParameter(g.ALIASED_LINE_WIDTH_RANGE)].join('|'); } catch (e) { return 'err'; } };
    add('WebGL params estáveis', glParam() === glParam(), 5, false);

    // ---- 9. Workers coerentes com a thread principal ----
    let workerUA = null, workerHc = null;
    try {
      const code = 'self.postMessage({ua:navigator.userAgent,hc:navigator.hardwareConcurrency})';
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      const r = await new Promise((res) => { const w = new Worker(url); const t = setTimeout(() => res({}), 3500); w.onmessage = (ev) => { clearTimeout(t); res(ev.data || {}); w.terminate(); }; });
      URL.revokeObjectURL(url); workerUA = r.ua; workerHc = r.hc;
    } catch (e) {}
    add('Worker: UA igual ao principal', workerUA === ua, 8, workerUA != null && workerUA !== ua);
    add('Worker: hardwareConcurrency igual', workerHc === navigator.hardwareConcurrency, 6, workerHc != null && workerHc !== navigator.hardwareConcurrency);

    // ---- 10. Permissions API coerente com Notification ----
    let permState = '';
    try { const p = await navigator.permissions.query({ name: 'notifications' }); permState = p && p.state; } catch (e) {}
    const permOk = !!permState && (typeof Notification === 'undefined' || Notification.permission === 'default' ? permState !== 'granted' : true);
    add('Permissions API coerente', !!permState, 5, false, permState);

    const total = checks.reduce((a, c) => a + c.weight, 0);
    const got = checks.reduce((a, c) => a + (c.ok ? c.weight : 0), 0);
    const lies = checks.filter((c) => c.lie && !c.ok).map((c) => c.name);
    return { score: Math.round((got / total) * 100), checks, lies };
  });
  return report;
}

module.exports = { runCoherence };
