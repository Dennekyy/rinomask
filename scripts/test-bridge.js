'use strict';

/*
 * Valida o BRIDGE de proxy SOCKS autenticado de forma deterministica,
 * sem depender de provedor externo: sobe um servidor SOCKS5 local COM auth
 * (RFC 1928 + 1929) e prova que o bridge:
 *   - autentica no SOCKS5 upstream (usuario/senha)
 *   - tunela HTTPS corretamente (o cliente sai pela rota do SOCKS)
 *   - REJEITA quando a senha esta errada
 */

const net = require('net');
const https = require('https');
const { startBridge } = require('../src/proxyBridge');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Servidor SOCKS5 minimo com auth usuario/senha (apenas para teste).
// Usa buffer + maquina de estados e repassa bytes adiantados (early data) ao destino.
function startSocks5Server({ user, pass }) {
  const server = net.createServer((sock) => {
    let stage = 'greet';
    let buf = Buffer.alloc(0);
    let upstream = null;

    const onData = (chunk) => {
      if (upstream) { upstream.write(chunk); return; } // ja conectado: encaminha
      buf = Buffer.concat([buf, chunk]);

      if (stage === 'greet') {
        if (buf.length < 2) return;
        const n = buf[1];
        if (buf.length < 2 + n) return;
        buf = buf.slice(2 + n);
        sock.write(Buffer.from([0x05, 0x02])); // exige usuario/senha
        stage = 'auth';
      }
      if (stage === 'auth') {
        if (buf.length < 2) return;
        const ulen = buf[1];
        if (buf.length < 3 + ulen) return;
        const plen = buf[2 + ulen];
        const need = 3 + ulen + plen;
        if (buf.length < need) return;
        const uname = buf.slice(2, 2 + ulen).toString();
        const passwd = buf.slice(3 + ulen, 3 + ulen + plen).toString();
        buf = buf.slice(need);
        if (uname !== user || passwd !== pass) { sock.write(Buffer.from([0x01, 0x01])); return sock.destroy(); }
        sock.write(Buffer.from([0x01, 0x00]));
        stage = 'req';
      }
      if (stage === 'req') {
        if (buf.length < 4) return;
        const atyp = buf[3];
        let host, off;
        if (atyp === 0x01) { if (buf.length < 10) return; host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`; off = 8; }
        else if (atyp === 0x03) { const len = buf[4]; if (buf.length < 7 + len) return; host = buf.slice(5, 5 + len).toString(); off = 5 + len; }
        else { return sock.destroy(); }
        const port = buf.readUInt16BE(off);
        const early = buf.slice(off + 2); // dados de aplicacao que vieram junto
        buf = Buffer.alloc(0);
        stage = 'done';
        const up = net.connect(port, host, () => {
          sock.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          if (early.length) up.write(early);
          up.pipe(sock);
          upstream = up;
        });
        up.on('error', () => { try { sock.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0])); } catch (e) {} sock.destroy(); });
        up.on('close', () => sock.destroy());
      }
    };

    sock.on('data', onData);
    sock.on('error', () => {});
  });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res({ port: server.address().port, close: () => server.close() })));
}

function realIpDirect() {
  return new Promise((resolve) => {
    https.get('https://api.ipify.org?format=json', (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => { try { resolve(JSON.parse(b).ip); } catch (e) { resolve(b.trim()); } }); }).on('error', () => resolve('erro'));
  });
}

function ipViaBridge(bridgePort) {
  return new Promise((resolve, reject) => {
    const agent = new HttpsProxyAgent(`http://127.0.0.1:${bridgePort}`);
    const req = https.get('https://api.ipify.org?format=json', { agent, timeout: 15000 }, (r) => {
      let b = ''; r.on('data', (c) => b += c);
      r.on('end', () => { try { const ip = JSON.parse(b).ip; ip ? resolve(ip) : reject(new Error('resposta vazia')); } catch (e) { reject(new Error('resposta invalida')); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

(async function main() {
  let pass = 0, fail = 0;
  const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };

  const realIp = await realIpDirect();
  console.log('IP real (referencia):', realIp, '\n');

  const socks = await startSocks5Server({ user: 'usuario_teste', pass: 'senha_correta' });

  // 1) Bridge com credenciais CORRETAS
  console.log('[1] SOCKS5 local COM auth correta -> bridge -> HTTPS:');
  const bridge = await startBridge({ type: 'socks5', host: '127.0.0.1', port: socks.port, username: 'usuario_teste', password: 'senha_correta' });
  console.log(`     SOCKS5 local porta ${socks.port}; bridge HTTP local porta ${bridge.port}`);
  let ip = null, err = null;
  try { ip = await ipViaBridge(bridge.port); } catch (e) { err = e.message; }
  check('Bridge autenticou no SOCKS5 e tunelou HTTPS', !!ip && !err, err || `IP de saida: ${ip}`);
  check('Trafego saiu pela rota do SOCKS (IP coerente)', ip === realIp, `bridge=${ip} ref=${realIp}`);
  bridge.close();

  // 2) Bridge com SENHA ERRADA deve falhar (sem tunel)
  console.log('\n[2] SOCKS5 local com SENHA ERRADA -> bridge deve recusar:');
  const bridgeBad = await startBridge({ type: 'socks5', host: '127.0.0.1', port: socks.port, username: 'usuario_teste', password: 'senha_ERRADA' });
  let ok2 = false, e2 = null;
  try { await ipViaBridge(bridgeBad.port); ok2 = true; } catch (e) { e2 = e.message; }
  check('Bridge NAO tunela com senha errada (auth falha no upstream)', ok2 === false, e2 ? 'recusou: ' + e2 : 'INDEVIDAMENTE conectou');
  bridgeBad.close();
  socks.close();

  console.log('\n==============================================');
  console.log(`  RESULTADO: ${pass} passou, ${fail} falhou`);
  console.log('  ' + (fail === 0 ? 'BRIDGE DE SOCKS AUTENTICADO VALIDADO ✅' : 'FALHA NO BRIDGE ❌'));
  console.log('==============================================');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e); process.exit(2); });
