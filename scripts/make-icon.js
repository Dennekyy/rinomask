'use strict';
// Gera, a partir da logo4 (rinoceronte preto), tudo a partir da MESMA arte fiel:
//   - build/icon.ico (+ icon.png): emblema PRETO sobre fundo AMARELO #f8c31c (canto arredondado)
//   - renderer/logo.png: máscara TRANSPARENTE em alta resolução (preto = opaco, branco = furo)
//     usada como `mask` recolorível no app. Preserva os detalhes finos (inclusive o OLHO),
//     que a vetorização bi-level achatava.
// Rodar: node_modules/electron/dist/electron.exe scripts/make-icon.js  (ou: npm run icon)
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZES = [256, 128, 64, 48, 32, 16];
const root = path.join(__dirname, '..');
const LOGO = path.join(root, 'build', 'logo4-src.png');
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
      const S = 1024;
      window.render = () => new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const c = document.getElementById('c'), x = c.getContext('2d');
          // 1) ícone: fundo amarelo arredondado + emblema preto (multiply)
          x.clearRect(0,0,S,S);
          const r = 224;
          x.fillStyle = ${JSON.stringify(YELLOW)};
          x.beginPath(); x.moveTo(r,0); x.arcTo(S,0,S,S,r); x.arcTo(S,S,0,S,r); x.arcTo(0,S,0,0,r); x.arcTo(0,0,S,0,r); x.closePath(); x.fill();
          x.save(); x.clip(); x.globalCompositeOperation = 'multiply';
          const pad = 36, w = S - pad*2; x.drawImage(img, pad, pad, w, w);
          x.restore();
          const icon = c.toDataURL('image/png');
          // 2) máscara transparente: alpha = escuridão (preto->opaco, branco->furo). Preserva o olho.
          x.globalCompositeOperation = 'source-over';
          x.clearRect(0,0,S,S);
          x.drawImage(img, 0, 0, S, S);
          const d = x.getImageData(0,0,S,S), p = d.data;
          for (let i=0;i<p.length;i+=4){ const a=p[i+3]; const lum = 0.299*p[i]+0.587*p[i+1]+0.114*p[i+2]; p[i]=p[i+1]=p[i+2]=0; p[i+3]=Math.round((255-lum)*a/255); }
          x.putImageData(d,0,0);
          const mask = c.toDataURL('image/png');
          res({ icon, mask });
        };
        img.onerror = () => res(null);
        img.src = 'data:image/png;base64,${logoB64}';
      });
    </script></body></html>`);

  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, webPreferences: { offscreen: true } });
  await win.loadFile(TMP);
  const out = await win.webContents.executeJavaScript('window.render()');
  if (!out || !out.icon) throw new Error('falha ao compor no canvas');

  const master = nativeImage.createFromDataURL(out.icon);
  const images = SIZES.map((s) => ({ size: s, buf: master.resize({ width: s, height: s, quality: 'best' }).toPNG() }));
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), makeIco(images));
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), master.resize({ width: 256, height: 256, quality: 'best' }).toPNG());

  const mask = nativeImage.createFromDataURL(out.mask);
  fs.writeFileSync(path.join(root, 'renderer', 'logo.png'), mask.resize({ width: 512, height: 512, quality: 'best' }).toPNG());

  fs.rmSync(TMP, { force: true });
  console.log('  build/icon.ico + icon.png (preto sobre amarelo) e renderer/logo.png (máscara fiel, com o olho) criados.');
  app.quit();
}).catch((e) => { console.error('ERRO:', e && e.message || e); try { fs.rmSync(TMP, { force: true }); } catch (x) {} app.exit(1); });
