'use strict';

// Injetada em CADA pagina ANTES dos scripts do site. So referencia seu argumento (fp).
function stealthInit(fp) {
  const define = (obj, prop, value) => {
    try { Object.defineProperty(obj, prop, { get: () => value, configurable: true }); } catch (e) {}
  };

  // --- Sinal de automacao ---
  try { define(Navigator.prototype, 'webdriver', false); } catch (e) {}

  // --- Hardware / navegador ---
  define(navigator, 'hardwareConcurrency', fp.hardwareConcurrency);
  define(navigator, 'deviceMemory', fp.deviceMemory);
  define(navigator, 'platform', fp.platform);
  define(navigator, 'languages', Object.freeze(fp.languages.slice()));
  define(navigator, 'maxTouchPoints', fp.maxTouchPoints);
  if (fp.doNotTrack) define(navigator, 'doNotTrack', '1');

  // --- Tela ---
  define(screen, 'width', fp.screen.width);
  define(screen, 'height', fp.screen.height);
  define(screen, 'availWidth', fp.screen.availWidth);
  define(screen, 'availHeight', fp.screen.availHeight);
  define(screen, 'colorDepth', fp.screen.colorDepth);
  define(screen, 'pixelDepth', fp.screen.pixelDepth);

  // --- Fuso horario ---
  try {
    const offset = fp.timezoneOffset;
    Date.prototype.getTimezoneOffset = function () { return offset; };
  } catch (e) {}

  // --- WebGL: vendor/renderer (sempre) + ruido na imagem (opcional) ---
  const patchGL = (proto) => {
    if (!proto) return;
    const getParam = proto.getParameter;
    proto.getParameter = function (p) {
      if (p === 37445) return fp.webgl.vendor;   // UNMASKED_VENDOR_WEBGL
      if (p === 37446) return fp.webgl.renderer; // UNMASKED_RENDERER_WEBGL
      return getParam.apply(this, arguments);
    };
    if (fp.webglMode === 'noise') {
      const readPixels = proto.readPixels;
      proto.readPixels = function () {
        const r = readPixels.apply(this, arguments);
        const px = arguments[6];
        if (px && px.length) {
          const seed = fp.canvasSeed || 1;
          for (let i = 0; i < px.length; i += 499) px[i] = px[i] ^ (seed & 1);
        }
        return r;
      };
    }
  };
  try {
    patchGL(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
    patchGL(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  } catch (e) {}

  // --- Canvas ---
  if (fp.canvasMode === 'noise') {
    try {
      const seed = (fp.canvasSeed || 1) >>> 0;
      // PRNG (mulberry32) semeado pelo seed COMPLETO do perfil: o ruido depende de
      // toda a semente (nao de seed%3), entao perfis diferentes praticamente nunca
      // colidem, e e reproduzido identico a cada chamada (fingerprint estavel por perfil).
      const makeRnd = () => {
        let s = seed;
        return () => {
          s = (s + 0x6d2b79f5) >>> 0;
          let t = s;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      };
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      const noisify = (data) => {
        const rnd = makeRnd();
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.max(0, Math.min(255, data[i] + (Math.floor(rnd() * 3) - 1)));
          data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + (Math.floor(rnd() * 3) - 1)));
          data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + (Math.floor(rnd() * 3) - 1)));
        }
      };
      CanvasRenderingContext2D.prototype.getImageData = function () {
        const img = origGetImageData.apply(this, arguments);
        noisify(img.data);
        return img;
      };
      HTMLCanvasElement.prototype.toDataURL = function () {
        try {
          const ctx = this.getContext('2d');
          if (ctx && this.width && this.height) {
            const img = origGetImageData.call(ctx, 0, 0, this.width, this.height);
            noisify(img.data);
            ctx.putImageData(img, 0, 0);
          }
        } catch (e) {}
        return origToDataURL.apply(this, arguments);
      };
    } catch (e) {}
  }

  // --- AudioContext ---
  if (fp.audioMode === 'noise') {
    try {
      const seed = (fp.audioSeed || 1) / 1e9;
      const orig = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = function () {
        const data = orig.apply(this, arguments);
        for (let i = 0; i < data.length; i += 137) data[i] = data[i] + seed;
        return data;
      };
    } catch (e) {}
  }

  // --- ClientRects: micro-ruido deterministico ---
  if (fp.clientRectsMode === 'noise') {
    try {
      const seed = ((fp.clientRectsSeed || 1) % 1000) / 1e6; // ~0.0000xx
      const origGetRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        const r = origGetRect.apply(this, arguments);
        return new DOMRect(r.x + seed, r.y + seed, r.width + seed, r.height + seed);
      };
    } catch (e) {}
  }

  // --- WebRTC ---
  if (fp.webrtcMode === 'disabled') {
    try {
      const block = function () { throw new Error('WebRTC desativado'); };
      window.RTCPeerConnection = block;
      window.webkitRTCPeerConnection = block;
    } catch (e) {}
  } else if (fp.webrtcMode === 'altered') {
    // Antivazamento: remove candidatos ICE com IP PUBLICO (host/srflx), mantendo
    // apenas mDNS (.local) e relay. Assim o IP real nunca aparece para a pagina,
    // mesmo que o Chromium colete via UDP direto (a flag de proxy sozinha nao basta).
    try {
      const OrigRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
      if (OrigRTC) {
        const isPublic = (ip) => {
          if (!ip || ip.endsWith('.local')) return false;
          if (ip.indexOf(':') >= 0) return !/^(fe80|fc|fd)/i.test(ip); // IPv6 publico
          return !/^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
        };
        const candLeaks = (s) => { if (!s) return false; const p = s.split(' '); return isPublic(p[4]); };
        const cleanSdp = (sdp) => !sdp ? sdp : sdp.split('\n').filter((l) => {
          if (l.indexOf('a=candidate:') === -1) return true;
          return !isPublic(l.trim().split(' ')[4]);
        }).join('\n');

        const Wrapped = function (cfg) {
          const pc = new OrigRTC(cfg);
          const wrap = (cb) => function (ev) {
            if (ev && ev.candidate && candLeaks(ev.candidate.candidate)) return; // descarta vazamento
            return cb.apply(this, arguments);
          };
          const origAdd = pc.addEventListener.bind(pc);
          pc.addEventListener = function (type, cb, opts) {
            return (type === 'icecandidate' && typeof cb === 'function') ? origAdd(type, wrap(cb), opts) : origAdd(type, cb, opts);
          };
          let _onc = null;
          Object.defineProperty(pc, 'onicecandidate', {
            configurable: true,
            get() { return _onc; },
            set(fn) { _onc = fn; if (fn) origAdd('icecandidate', wrap(fn)); },
          });
          ['localDescription', 'currentLocalDescription'].forEach((prop) => {
            const d = Object.getOwnPropertyDescriptor(OrigRTC.prototype, prop);
            if (d && d.get) {
              Object.defineProperty(pc, prop, {
                configurable: true,
                get() { const v = d.get.call(pc); return v ? { type: v.type, sdp: cleanSdp(v.sdp) } : v; },
              });
            }
          });
          return pc;
        };
        Wrapped.prototype = OrigRTC.prototype;
        try { Object.setPrototypeOf(Wrapped, OrigRTC); } catch (e) {} // herda estaticos (generateCertificate)
        try { window.RTCPeerConnection = Wrapped; } catch (e) {}
        try { window.webkitRTCPeerConnection = Wrapped; } catch (e) {}
      }
    } catch (e) {}
  }

  // --- chrome runtime stub ---
  try { if (!window.chrome) window.chrome = { runtime: {}, app: { isInstalled: false } }; } catch (e) {}

  // --- Permissions coerentes ---
  try {
    const q = window.navigator.permissions.query;
    window.navigator.permissions.query = (params) =>
      params && params.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : q(params);
  } catch (e) {}
}

module.exports = { stealthInit };
