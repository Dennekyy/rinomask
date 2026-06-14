'use strict';

// Gera fingerprints realistas e CONSISTENTES por perfil, com parametros avancados
// no estilo Dolphin: WebRTC, Canvas, WebGL (info/imagem), ClientRects, AudioContext,
// MediaDevices, Geolocalizacao, DoNotTrack, fontes.

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const CHROME_VERSIONS = ['122.0.0.0', '123.0.0.0', '124.0.0.0', '125.0.0.0', '126.0.0.0'];

const PLATFORMS = [
  {
    os: 'Windows',
    platform: 'Win32',
    uaPlatform: 'Windows',
    ua: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
    webgl: [
      { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
      { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
      { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
      { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    ],
  },
  {
    os: 'macOS',
    platform: 'MacIntel',
    uaPlatform: 'macOS',
    ua: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:135.0) Gecko/20100101 Firefox/135.0',
    webgl: [
      { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)' },
      { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M2, OpenGL 4.1)' },
      { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics OpenGL Engine, OpenGL 4.1)' },
    ],
  },
];

const SCREENS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1440 },
];

const REGIONS = [
  { timezone: 'America/Sao_Paulo', locale: 'pt-BR', languages: ['pt-BR', 'pt', 'en-US', 'en'], geo: { lat: -23.55, lon: -46.63 } },
  { timezone: 'America/New_York', locale: 'en-US', languages: ['en-US', 'en'], geo: { lat: 40.71, lon: -74.0 } },
  { timezone: 'America/Los_Angeles', locale: 'en-US', languages: ['en-US', 'en'], geo: { lat: 34.05, lon: -118.24 } },
  { timezone: 'Europe/London', locale: 'en-GB', languages: ['en-GB', 'en'], geo: { lat: 51.5, lon: -0.12 } },
  { timezone: 'Europe/Madrid', locale: 'es-ES', languages: ['es-ES', 'es', 'en'], geo: { lat: 40.41, lon: -3.7 } },
  { timezone: 'Europe/Lisbon', locale: 'pt-PT', languages: ['pt-PT', 'pt', 'en'], geo: { lat: 38.72, lon: -9.13 } },
];

const HW_CONCURRENCY = [4, 6, 8, 12, 16];
// navigator.deviceMemory e LIMITADO a 8 pela spec do Chrome (nunca reporta 16).
// Reportar 16 seria uma contradicao detectavel. Valores reais possiveis: 4 ou 8.
const DEVICE_MEMORY = [4, 8];

const WINDOWS_FONTS = ['Arial', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
const MAC_FONTS = ['Helvetica Neue', 'Helvetica', 'Arial', 'Courier', 'Geneva', 'Lucida Grande', 'Menlo', 'Monaco', 'Times', 'Avenir'];

function tzOffsetMinutes(timeZone) {
  const d = new Date();
  const tz = new Date(d.toLocaleString('en-US', { timeZone }));
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((utc - tz) / 60000);
}

function generateFingerprint(opts = {}) {
  const plat = opts.os ? PLATFORMS.find((p) => p.os === opts.os) || rand(PLATFORMS) : rand(PLATFORMS);
  const region = opts.region ? REGIONS.find((r) => r.timezone === opts.region) || rand(REGIONS) : rand(REGIONS);
  const chrome = rand(CHROME_VERSIONS);
  const screen = rand(SCREENS);
  const webgl = rand(plat.webgl);
  const taskbar = plat.os === 'macOS' ? 25 : 40;
  // CPU e RAM correlacionados (evita combos estranhos como 16 nucleos + 4GB).
  const cpu = rand(HW_CONCURRENCY);
  const mem = cpu >= 12 ? 8 : rand(DEVICE_MEMORY);

  return {
    engine: 'camoufox',
    os: plat.os,
    userAgent: plat.ua(chrome),
    platform: plat.platform,
    uaPlatform: plat.uaPlatform,
    chromeVersion: chrome,
    hardwareConcurrency: cpu,
    deviceMemory: mem,
    maxTouchPoints: 0,
    locale: region.locale,
    languages: region.languages,
    timezoneMode: 'auto', // auto = alinhar ao IP do proxy; manual = usar 'timezone'
    timezone: region.timezone,
    timezoneOffset: tzOffsetMinutes(region.timezone),
    screen: {
      width: screen.width, height: screen.height,
      availWidth: screen.width, availHeight: screen.height - taskbar,
      colorDepth: 24, pixelDepth: 24,
    },
    webgl,
    // Modos de protecao (estilo Dolphin):
    canvasMode: 'noise',      // noise | off
    webglMode: 'noise',       // noise | off  (WebGL Image)
    audioMode: 'noise',       // noise | off
    clientRectsMode: 'noise', // noise | off
    webrtcMode: 'altered',    // altered (mascara via proxy) | real | disabled
    geolocation: { mode: 'auto', lat: region.geo.lat, lon: region.geo.lon, accuracy: 50 },
    doNotTrack: false,
    fonts: plat.os === 'macOS' ? MAC_FONTS.slice() : WINDOWS_FONTS.slice(),
    // Sementes deterministicas (identidade estavel por perfil):
    canvasSeed: randInt(1, 1e6),
    audioSeed: randInt(1, 1e6),
    clientRectsSeed: randInt(1, 1e6),
  };
}

module.exports = { generateFingerprint, REGIONS, PLATFORMS, WINDOWS_FONTS, MAC_FONTS, tzOffsetMinutes };
