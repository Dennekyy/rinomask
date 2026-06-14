'use strict';
// Gera os ícones do app a partir da logo4 (rinoceronte preto): emblema PRETO sobre fundo
// AMARELO #f8c31c (quadrado arredondado), em build/icon.ico (+ icon.png). Também renderiza
// um preview do SVG traçado (renderer/logo.svg) para conferência.
// Rodar: node_modules/electron/dist/electron.exe scripts/make-icon.js  (ou: npm run icon)
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZES = [256, 128, 64, 48, 32, 16];
const root = path.join(__dirname, '..');
const LOGO = path.join(root, 'build', 'logo4-src.png');
const SVG = path.join(root, 'renderer', 'logo.svg');
const TMP = path.join(root, 'build', '_iconmaker.html');
const YELLOW = '#f8c31c';

function makeIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);
  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count; const datas = [];
  images.forEach((img, i) => {
    const e = i * 16;
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e); entries.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1);
    entries.writeUInt16LE(1, e + 4); entries.writeUInt16LE(32, e + 6);
    entries.writeUInt32LE(img.buf.length, e + 8); entries.writeUInt32LE(offset, e + 12);
    offset += img.buf.length; datas.push(img.buf);
  });
  return Buffer.concat([header, entries, ...datas]);
}

app.whenReady().then(async () => {
  const logoB64 = fs.readFileSync(LOGO).toString('base64');
  fs.writeFileSync(TMP, `<!doctype html><html><body style="margin:0">
    <canvas id="c" width="1024" height="1024"></canvas>
    <script>
      window.render = () => new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const c = document.getElementById('c'), x = c.getContext('2d');
          const S = 1024, r = 224; // canto arredondado
          x.fillStyle = ${JSON.stringify(YELLOW)};
          x.beginPath();
          x.moveTo(r,0); x.arcTo(S,0,S,S,r); x.arcTo(S,S,0,S,r); x.arcTo(0,S,0,0,r); x.arcTo(0,0,S,0,r); x.closePath(); x.fill();
          // emblema preto via multiply (branco da logo vira amarelo, preto continua preto)
          x.save(); x.clip(); x.globalCompositeOperation = 'multiply';
          const pad = 36, w = S - pad*2;
          x.drawImage(img, pad, pad, w, w);
          x.restore();
          res(c.toDataURL('image/png'));
        };
        img.onerror = () => res('');
        img.src = 'data:image/png;base64,${logoB64}';
      });
    </script></body></html>`);

  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, webPreferences: { offscreen: true } });
  await win.loadFile(TMP);
  const dataUrl = await win.webContents.executeJavaScript('window.render()');
  if (!dataUrl) throw new Error('falha ao compor o ícone no canvas');
  const master = nativeImage.createFromDataURL(dataUrl);

  const images = SIZES.map((s) => ({ size: s, buf: master.resize({ width: s, height: s, quality: 'best' }).toPNG() }));
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), makeIco(images));
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), master.resize({ width: 256, height: 256, quality: 'best' }).toPNG());

  // preview do SVG traçado: branco sobre fundo escuro (confere o tracing)
  if (fs.existsSync(SVG)) {
    const svg = fs.readFileSync(SVG, 'utf8').replace('currentColor', '#ffffff');
    fs.writeFileSync(TMP, `<!doctype html><html><body style="margin:0;background:#0b0b0b;display:grid;place-items:center;height:1024px"><div style="width:760px;height:760px;color:#fff">${svg}</div></body></html>`);
    await win.loadFile(TMP);
    await new Promise((r) => setTimeout(r, 300));
    const prev = await win.webContents.capturePage();
    fs.writeFileSync(path.join(root, 'build', '_logo-preview.png'), prev.toPNG());
  }
  fs.rmSync(TMP, { force: true });

  console.log('  build/icon.ico + icon.png (preto sobre amarelo) e build/_logo-preview.png criados.');
  app.quit();
}).catch((e) => { console.error('ERRO:', e && e.message || e); try { fs.rmSync(TMP, { force: true }); } catch (x) {} app.exit(1); });
