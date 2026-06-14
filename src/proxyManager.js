'use strict';

const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

// Normaliza um objeto de proxy vindo da UI.
function normalizeProxy(p) {
  if (!p || !p.host || !p.port) return null;
  return {
    type: (p.type || 'http').toLowerCase(), // http | https | socks5 | socks4
    host: String(p.host).trim(),
    port: parseInt(p.port, 10),
    username: p.username ? String(p.username).trim() : '',
    password: p.password ? String(p.password) : '',
  };
}

// Monta a string de servidor para o Playwright.
function toPlaywrightProxy(p) {
  const proxy = normalizeProxy(p);
  if (!proxy) return null;
  const out = { server: `${proxy.type}://${proxy.host}:${proxy.port}` };
  if (proxy.username) {
    out.username = proxy.username;
    out.password = proxy.password;
  }
  return out;
}

// Monta a URL completa (com auth) para os agents de teste.
function toUrl(proxy) {
  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
    : '';
  return `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
}

// Testa o proxy fazendo uma requisicao HTTPS e retornando o IP de saida.
function testProxy(raw) {
  const proxy = normalizeProxy(raw);
  return new Promise((resolve) => {
    if (!proxy) return resolve({ ok: false, error: 'Proxy invalido (host/porta obrigatorios)' });

    let agent;
    try {
      const url = toUrl(proxy);
      agent = proxy.type.startsWith('socks')
        ? new SocksProxyAgent(url)
        : new HttpsProxyAgent(url);
    } catch (e) {
      return resolve({ ok: false, error: e.message });
    }

    const started = Date.now();
    const req = https.get(
      'https://api.ipify.org?format=json',
      { agent, timeout: 15000 },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          let ip = body.trim();
          try {
            ip = JSON.parse(body).ip;
          } catch (e) {}
          resolve({ ok: true, ip, latencyMs: Date.now() - started });
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout (15s)' });
    });
  });
}

module.exports = { normalizeProxy, toPlaywrightProxy, testProxy };
