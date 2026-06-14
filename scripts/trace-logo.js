'use strict';
// Vetoriza build/logo4-src.png (rinoceronte preto) para renderer/logo.svg — um SVG de
// caminho único, recolorível (serve de máscara CSS). Precisa do pacote 'potrace'
// (npm i -D potrace). Rodar: node scripts/trace-logo.js
const fs = require('fs');
const path = require('path');
const potrace = require('potrace');

const src = path.join(__dirname, '..', 'build', 'logo4-src.png');
const out = path.join(__dirname, '..', 'renderer', 'logo.svg');

potrace.trace(src, { threshold: 165, turdSize: 60, optTolerance: 0.35, turnPolicy: potrace.Potrace.TURNPOLICY_MINORITY, color: '#000000', background: 'transparent' }, (err, svg) => {
  if (err) { console.error('ERRO ao traçar:', err.message); process.exit(1); }
  // Normaliza: fill currentColor (recolorível) e mantém o viewBox para centralizar bem.
  const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 100 100';
  const d = (svg.match(/ d="([^"]+)"/) || [])[1] || '';
  const clean = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
  fs.writeFileSync(out, clean);
  console.log(`logo.svg gerado — viewBox=${vb}, path=${d.length} chars`);
});
