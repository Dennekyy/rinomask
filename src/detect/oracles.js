'use strict';

// Adaptadores para ORÁCULOS DE DETECÇÃO externos e mantidos por terceiros.
// Abrimos o perfil contra cada detector real e raspamos o veredito/score. Assim a
// manutenção do "gato e rato" fica com quem mantém o detector, não com a gente.
// Cada adaptador é resiliente (regex sobre o texto + timeouts) e devolve:
//   { name, url, ok, score(0-100|null), verdict, raw }
// É da natureza desse QA que o scraping precise de ajuste fino quando o site muda.

async function settle(page, signalRegex, ms = 45000) {
  try { await page.waitForFunction((re) => new RegExp(re, 'i').test(document.body.innerText || ''), signalRegex.source, { timeout: ms }); } catch (e) {}
  await page.waitForTimeout(3500);
}
async function bodyText(page) { try { return await page.evaluate(() => document.body.innerText || ''); } catch (e) { return ''; } }
async function go(page, url) { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }

// CreepJS — referência aberta do mercado: trust score, "lies", headless/stealth.
async function creepjs(page) {
  const url = 'https://abrahamjuliot.github.io/creepjs/';
  const r = { name: 'CreepJS', url, ok: false, score: null, verdict: '', raw: '' };
  try {
    await go(page, url);
    // CreepJS renderiza por seções (lazy) e é lento: rola pra disparar e espera o VALOR no DOM.
    for (let i = 0; i < 6; i++) { try { await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight / 4)); } catch (e) {} await page.waitForTimeout(2500); }
    await page.waitForFunction(() => /trust score[\s\S]{0,80}?\d{1,3}\s*%/i.test(document.body.textContent || ''), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const t = await page.evaluate(() => document.body.textContent || '').catch(() => '');
    r.raw = (t.match(/trust score[\s\S]{0,70}/i) || [''])[0].replace(/\s+/g, ' ').trim().slice(0, 120);
    const score = t.match(/trust score[\s\S]{0,80}?(\d{1,3}(?:\.\d+)?)\s*%/i);
    const lies = t.match(/(\d+)\s+lie/i);
    if (score) r.score = Math.round(parseFloat(score[1]));
    r.verdict = (r.score != null ? r.score + '%' : '?') + (lies ? ` · ${lies[1]} mentira(s)` : '');
    r.ok = r.score != null || !!lies;
    if (process.env.DETECT_DEBUG === '1') {
      const around = (t.match(/[\s\S]{0,60}trust score[\s\S]{0,120}/i) || [''])[0].replace(/\s+/g, ' ').trim();
      const pcts = (t.match(/\d{1,3}\s*%/g) || []).slice(0, 8).join(' ');
      r.debug = `len=${t.length} | around="${around}" | pcts=[${pcts}]`;
    }
  } catch (e) { r.error = e.message; }
  return r;
}

// BrowserScan — score de fingerprint + detecção de robô.
async function browserscan(page) {
  const url = 'https://www.browserscan.net/';
  const r = { name: 'BrowserScan', url, ok: false, score: null, verdict: '', raw: '' };
  try {
    await go(page, url);
    await settle(page, /(\d{1,3}\s*%|authentic|robot)/, 45000);
    const t = await bodyText(page);
    const score = t.match(/(\d{1,3})\s*%/);
    if (score) r.score = Math.min(100, parseInt(score[1], 10));
    const auth = /authentic/i.test(t), robot = /\brobot\b/i.test(t);
    r.verdict = (r.score != null ? r.score + '%' : '?') + (auth ? ' · authentic' : robot ? ' · robot?' : '');
    r.raw = (t.match(/.{0,40}(authentic|trust|robot).{0,40}/i) || [''])[0].replace(/\s+/g, ' ').trim().slice(0, 120);
    r.ok = r.score != null || auth;
  } catch (e) { r.error = e.message; }
  return r;
}

// Iphey — veredito Trustworthy / Suspicious / Not reliable.
// Lê o ELEMENTO do veredito (texto curto e exato), não o texto de ajuda da página.
async function iphey(page) {
  const url = 'https://iphey.com/';
  const r = { name: 'Iphey', url, ok: false, score: null, verdict: '', raw: '' };
  try {
    await go(page, url);
    const findVerdict = () => {
      const words = ['trustworthy', 'suspicious', 'not reliable'];
      const els = Array.from(document.querySelectorAll('div,span,h1,h2,h3,h4,strong,b,p'));
      for (const el of els) {
        const txt = (el.textContent || '').trim();
        if (txt.length <= 16) { const low = txt.toLowerCase(); if (words.includes(low)) return txt; }
      }
      return '';
    };
    await page.waitForFunction(`(${findVerdict.toString()})()`, null, { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const verdict = await page.evaluate(findVerdict);
    if (verdict) {
      const v = verdict.toLowerCase();
      r.verdict = verdict;
      r.score = v === 'trustworthy' ? 100 : v === 'suspicious' ? 50 : 10; // normaliza p/ comparar
      r.ok = true;
    }
    r.raw = verdict || '(veredito não localizado)';
  } catch (e) { r.error = e.message; }
  return r;
}

// Vazamentos (IP/WebRTC/fuso) — o vetor mais crítico p/ antidetect e NÃO coberto pelos
// oráculos de fingerprint. Faz tudo em página (sem scraping frágil): compara o IP visto por
// HTTP com os IPs do WebRTC (vazamento se diferirem) e o fuso do navegador com a geo do IP.
async function leaks(page) {
  const r = { name: 'Vazamentos (IP/WebRTC/fuso)', url: 'rede', ok: false, score: null, verdict: '', raw: '' };
  try {
    await page.goto('https://example.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    const d = await page.evaluate(async () => {
      const j = async (u) => { try { return await (await fetch(u)).json(); } catch (e) { return null; } };
      const ipj = await j('https://api.ipify.org?format=json');
      const geo = (await j('https://ipapi.co/json/')) || {};
      const webrtcIps = await new Promise((res) => {
        const ips = new Set();
        try {
          const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
          pc.createDataChannel('x');
          pc.onicecandidate = (e) => { if (!e.candidate) return res([...ips]); const m = /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/.exec(e.candidate.candidate || ''); if (m && !/\.local/.test(e.candidate.candidate)) ips.add(m[1]); };
          pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => {});
          setTimeout(() => res([...ips]), 4500);
        } catch (e) { res([]); }
      });
      return { httpIp: ipj && ipj.ip, webrtcIps, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, geoTz: geo.timezone, country: geo.country_name };
    });
    const priv = (ip) => /^(10|127|0|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(ip);
    const pubWebrtc = (d.webrtcIps || []).filter((ip) => /^[0-9.]+$/.test(ip) && !priv(ip));
    const leak = !!d.httpIp && pubWebrtc.some((ip) => ip !== d.httpIp);
    const tzMismatch = !!(d.tz && d.geoTz && d.tz !== d.geoTz);
    let score = 100; const flags = [];
    if (leak) { score = Math.min(score, 25); flags.push('WebRTC vaza IP real'); }
    if (tzMismatch) { score = Math.min(score, 60); flags.push(`fuso ${d.tz} ≠ geo ${d.geoTz}`); }
    r.score = score; r.ok = true;
    r.verdict = flags.length ? flags.join(' · ') : 'sem vazamento · fuso coerente';
    r.raw = `IP HTTP ${d.httpIp || '?'} · WebRTC [${pubWebrtc.join(', ') || 'nenhum público'}] · geo ${d.country || '?'}`;
  } catch (e) { r.error = e.message; }
  return r;
}

const ORACLES = { leaks, creepjs, browserscan, iphey };

module.exports = { ORACLES };
