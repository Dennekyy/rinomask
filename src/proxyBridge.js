'use strict';

// Ponte local para proxies SOCKS autenticados.
// O Chromium NAO faz autenticacao SOCKS5 (usuario/senha). Esta ponte sobe um
// proxy HTTP local SEM auth em 127.0.0.1:<porta-aleatoria> e repassa todo o
// trafego para o SOCKS5/4 upstream (fazendo a auth). O navegador aponta para a ponte.

const http = require('http');
const { SocksClient } = require('socks');

function socksConnect(up, host, port) {
  return SocksClient.createConnection({
    proxy: {
      host: up.host,
      port: Number(up.port),
      type: up.type === 'socks4' ? 4 : 5,
      userId: up.username || undefined,
      password: up.password || undefined,
    },
    command: 'connect',
    destination: { host, port: Number(port) },
    timeout: 20000,
  });
}

function startBridge(upstream) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();

    // HTTPS (a maioria do trafego): tunel CONNECT.
    server.on('connect', (req, client, head) => {
      const idx = req.url.lastIndexOf(':');
      const host = req.url.slice(0, idx);
      const port = req.url.slice(idx + 1) || '443';
      socksConnect(upstream, host, port)
        .then(({ socket }) => {
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head && head.length) socket.write(head);
          socket.pipe(client);
          client.pipe(socket);
          const close = () => { socket.destroy(); client.destroy(); };
          socket.on('error', close);
          client.on('error', close);
          client.on('close', () => socket.destroy());
        })
        .catch(() => { try { client.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); client.destroy(); } catch (e) {} });
    });

    // HTTP simples (raro hoje): repassa a requisicao bruta.
    server.on('request', (req, res) => {
      let host, port, pathOnly;
      try { const u = new URL(req.url); host = u.hostname; port = u.port || 80; pathOnly = u.pathname + u.search; }
      catch (e) { res.writeHead(400); return res.end(); }
      socksConnect(upstream, host, port)
        .then(({ socket }) => {
          socket.write(`${req.method} ${pathOnly} HTTP/1.1\r\n`);
          for (let i = 0; i < req.rawHeaders.length; i += 2) {
            if (/^proxy-/i.test(req.rawHeaders[i])) continue;
            socket.write(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`);
          }
          socket.write('\r\n');
          req.pipe(socket);
          socket.pipe(res.socket);
          socket.on('error', () => socket.destroy());
          res.on('close', () => socket.destroy());
        })
        .catch(() => { try { res.writeHead(502); res.end(); } catch (e) {} });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({ port: server.address().port, close: () => { try { server.close(); } catch (e) {} } });
    });
  });
}

module.exports = { startBridge };
