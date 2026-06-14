'use strict';
// Gera ícones CIRCULARES (cantos transparentes) a partir de build/icon-src.png:
//   build/icon.ico (multi-resolução), build/icon.png e renderer/logo.png.
// Usa um canvas (Electron offscreen) p/ recortar a imagem num círculo; depois redimensiona.
// Rodar: node_modules/electron/dist/electron.exe scripts/make-icon.js   (ou: npm run icon)
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZES = [256, 128, 64, 48, 32, 16];
const root = path.join(__dirname, '..');
const SRC = path.join(root, 'build', 'icon-src.png');
const TMP_HTML = path.join(root, 'build', '_iconmaker.html');

function makeIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);
  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const datas = [];
  images.forEach((img, i) => {
    const e = i * 16;
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e);
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1);
    entries.writeUInt16LE(1, e + 4); entries.writeUInt16LE(32, e + 6);
    entries.writeUInt32LE(img.buf.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += img.buf.length;
    datas.push(img.buf);
  });
  return Buffer.concat([header, entries, ...datas]);
}

app.whenReady().then(async () => {
  if (!fs.existsSync(SRC)) throw new Error('build/icon-src.png não encontrado.');
  // HTML temporário: desenha icon-src.png recortado num círculo de 1024² e devolve PNG.
  fs.writeFileSync(TMP_HTML, `<!doctype html><html><body style="margin:0">
    <canvas id="c" width="1024" height="1024"></canvas>
    <script>
      window.render = () => new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const c = document.getElementById('c'), x = c.getContext('2d');
          x.clearRect(0, 0, 1024, 1024);
          x.save();
          x.beginPath(); x.arc(512, 512, 511, 0, Math.PI * 2); x.closePath(); x.clip();
          x.drawImage(img, 0, 0, 1024, 1024);
          x.restore();
          res(c.toDataURL('image/png'));
        };
        img.onerror = () => res('');
        img.src = 'icon-src.png';
      });
    </script></body></html>`);

  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, webPreferences: { offscreen: true } });
  await win.loadFile(TMP_HTML);
  const dataUrl = await win.webContents.executeJavaScript('window.render()');
  if (!dataUrl) throw new Error('falha ao recortar a imagem no canvas');
  const master = nativeImage.createFromDataURL(dataUrl); // círculo 1024² com transparência
  if (master.isEmpty()) throw new Error('imagem circular vazia');

  const images = SIZES.map((s) => ({ size: s, buf: master.resize({ width: s, height: s, quality: 'best' }).toPNG() }));
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), makeIco(images));
  const png256 = master.resize({ width: 256, height: 256, quality: 'best' }).toPNG();
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), png256);
  fs.writeFileSync(path.join(root, 'renderer', 'logo.png'), png256); // logo do app (já circular)
  fs.rmSync(TMP_HTML, { force: true });

  images.forEach((i) => console.log(`  ${i.size}x${i.size} → ${i.buf.length} bytes`));
  console.log('  ícones CIRCULARES criados: build/icon.ico, build/icon.png, renderer/logo.png');
  app.quit();
}).catch((e) => { console.error('ERRO:', e && e.message || e); try { fs.rmSync(TMP_HTML, { force: true }); } catch (x) {} app.exit(1); });
