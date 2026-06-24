'use strict';
// Embute o motor Camoufox (~530 MB baixados, ~950 MB extraidos) dentro do instalador, em vez
// de depender de download na primeira execucao. Roda ANTES do electron-builder empacotar:
// garante que o motor esta baixado nesta maquina (reaproveita o mesmo fetch que o app usa em
// runtime) e copia o cache pra build/camoufox-engine/ (gitignored — nunca commitado).
// electron/main.js (boot) detecta essa pasta via process.resourcesPath e copia pro lugar
// certo na primeira execucao do usuario, sem precisar de rede.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const stageDir = path.join(root, 'build', 'camoufox-engine');

(async () => {
  const camoufox = require(path.join(root, 'src', 'engines', 'camoufox.js'));
  const installed = await camoufox.isInstalled();
  if (!installed) {
    console.log('[stage-camoufox-engine] motor nao esta instalado nesta maquina — baixando antes de empacotar...');
    const cliPath = require.resolve('camoufox-js/dist/__main__.js', { paths: [root] });
    const r = spawnSync(process.execPath, [cliPath, 'fetch'], { cwd: root, stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    if (r.status !== 0 || !(await camoufox.isInstalled())) {
      console.error('[stage-camoufox-engine] falha ao baixar o motor para staging — abortando (rode novamente com internet disponivel).');
      process.exit(1);
    }
  }

  const installDir = await camoufox.installDir();
  console.log(`[stage-camoufox-engine] copiando ${installDir} -> ${stageDir} ...`);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.cpSync(installDir, stageDir, { recursive: true });
  console.log('[stage-camoufox-engine] motor preparado para empacotamento.');
})().catch((e) => { console.error('[stage-camoufox-engine] erro:', e && e.stack || e); process.exit(1); });
