# Pílula de identidade e Hub de navegadores

Documento técnico das duas funcionalidades criadas em 2026-10-07: o que fazem, como funcionam por
dentro, por que foram feitas assim e as armadilhas encontradas no caminho. Leia antes de mexer em
`src/pill*`, `src/hub/` ou `src/windows/`.

## Visão geral

| | O quê | Onde vive |
|---|---|---|
| **Pílula** | Nome do perfil (e cor) no topo de cada navegador | Interface do Firefox (chrome), via autoconfig |
| **Hub** | Janela única que encaixa e reorganiza os navegadores abertos | Processo principal do Electron + Win32 (koffi) |

Princípio comum: **nada é injetado nas páginas.** Tudo roda na interface do navegador ou fora dele
(janelas do Windows). Os sites não enxergam a pílula nem o hub, e o fingerprint não muda.

## Pílula de identidade

### Como chega ao navegador

O Camoufox já vem com autoconfig ligado (`general.config.filename = camoufox.cfg`, definido no
`omni.ja`). O RinoMask anexa ao fim do `camoufox.cfg` um bloco JS delimitado:

```
// >>> RINOMASK PILL v3
...código de src/pill/pill.cfg.js...
// <<< RINOMASK PILL
```

`src/pill.js` (`applyPill`) faz isso de forma **idempotente**: troca o bloco se a versão mudou,
reaplica se o motor foi rebaixado e não regrava se já está igual. Roda no startup e depois de baixar o
motor, nos mesmos pontos do `branding.js` (`electron/main.js`). O build (`npm run dist`) copia o
motor da cache para o pacote, então o instalador já sai com o bloco.

### Armadilhas

- **Sandbox do autoconfig.** No Firefox de release o `.cfg` roda em sandbox, onde só existem
  `pref()`/`defaultPref()`, sem `Services` e sem interface. O bloco saía **sem nenhum erro**. A solução
  é `defaults/pref/rinomask-autoconfig.js` com `pref("general.config.sandbox_enabled", false)`, a
  mesma técnica do fx-autoconfig. O `applyPill` grava esse arquivo também.
- **ASCII obrigatório.** O autoconfig não lê UTF-8 com segurança. O código fora de comentários precisa
  ser ASCII, com acentos via `\uXXXX`. O `scripts/test-pill.js` verifica isso. A ferramenta Edit
  converte `—` no próprio caractere, então depois de editar o bloco rode um escape (ver o
  histórico dos commits).
- **Fontes em perfis macOS/Linux.** Esses perfis escondem as fontes do Windows por coerência do
  fingerprint. O Firefox 152 desenha minimizar/maximizar/fechar com glifos da "Segoe Fluent Icons"
  (`content: "\e921"`…) e o texto da interface em Segoe UI. Por isso os botões apareciam "em glitch"
  e o texto em serifa. A mesma folha da pílula troca os glifos por **SVG** e define a fonte da
  interface como `"Segoe UI","Helvetica Neue",Arimo,Arial,sans-serif`, que é a nativa visível em cada
  SO. Helvetica Neue e Arimo vêm embutidas no Camoufox.
- **Captura de tela engana.** `PrintWindow` em janelas do Firefox devolve um quadro antigo em cache.
  Para conferir visual, coloque a janela em TOPMOST e use `CopyFromScreen` na área dela. Para
  diagnosticar a pílula por dentro, grave rastros em prefs (`S.prefs.setStringPref`), que vão para o
  `prefs.js` do perfil.

### Dados

- Nome: pref `rinomask.profile.name`, enviada em `firefox_user_prefs` (`src/engines/camoufox.js`).
  Vai para o `user.js` a cada abertura.
- Cor: pref `rinomask.pill.color`, salva pelo próprio navegador no `prefs.js`. **Nunca** vai no
  `user.js`: ele é regravado a cada abertura e resetaria a escolha.
- Estilo: folha AUTHOR carregada com `windowUtils.loadSheetUsingURIString`, só na interface.
  Visual de "etiqueta": fundo tingido pela cor, borda fina, ponto sólido e nome claro.
- Clique esquerdo: se existir `<perfil>/rinomask-hub.member`, grava `rinomask-hub.signal` e o hub
  destaca o perfil. Fora do hub, abre as cores. O botão direito sempre abre as cores.

## Hub de navegadores

### Decisão principal: organizar janelas reais, não embutir

Cada navegador é um processo `camoufox.exe` separado. Foram testadas duas abordagens (Fase 0):

- **A) Embutir com `SetParent`.** Falhou no Firefox: teclado, foco e tela cheia quebram.
- **B) Organizar as janelas reais (escolhida).** O hub vira **dono** (`GWLP_HWNDPARENT`) de cada
  janela, então elas ficam sempre por cima dele e minimizam e restauram junto. O hub as posiciona
  com `DeferWindowPos` na área abaixo da barra.

### Módulos

| Arquivo | Papel |
|---|---|
| `src/windows/winapi.js` | user32/dwmapi/kernel32 via koffi: achar janelas, dono, posicionar, bordas DWM, escutar janelas novas, nome do executável |
| `src/hub/layout.js` | Cálculo **puro** do layout: grade, foco com scroll lateral, solo, mínimo de tamanho e excedentes |
| `src/hub/hub.js` | Controlador: janela do hub, membros, vigia, atalhos, abrir e fechar, API `hub.*` |
| `src/hub/staging.js` | Bastidor: esconde fora da tela as janelas que nascem enquanto há perfis carregando |
| `src/hub/signals.js` | Ponte por arquivo entre a pílula (dentro do navegador) e o hub |
| `renderer/hub.html` · `hub.css` · `hub-view.js` | Barra de pílulas, espaços reservados e faixa de scroll |

Canais IPC (`electron/main.js`): `hub.open {ids?}`, `hub.state`, `hub.priority {id}`,
`hub.mode {mode}`, `hub.remove {id}`, `hub.addRunning`, `hub.scroll {delta}`.

### Comportamentos

- **Grade:** colunas = ⌈√n⌉; a última linha incompleta estica.
- **Foco:** o priorizado ocupa 70% da largura e os demais ficam empilhados à direita, com altura
  mínima de 180 px (até 6 navegadores num 1080p). Acima disso, aparece uma faixa de scroll no pé da
  lateral.
- **Solo:** maximizar um navegador o expande no hub inteiro; maximizar de novo volta ao layout.
- **Vigia (200 ms):** recoloca quem saiu do lugar e ignora quem está em tela cheia. Também detecta
  janelas fechadas e minimizadas (estas viram "estacionadas"), sinais da pílula e soltar uma janela
  sobre outra, o que troca as duas. O arraste só conta se o tamanho não mudou e se já passaram 4 s
  desde a entrada.
- **Janelas coladas:** o Windows 11 tem uma borda invisível de cerca de 8 px. O hub mede essa borda
  (`DWMWA_EXTENDED_FRAME_BOUNDS`) e a sobrepõe às vizinhas.
- **Atalhos:** `Alt+1…9` e `Alt+0`, registrados só enquanto o hub ou um navegador dele está em
  primeiro plano. `Ctrl+Alt` foi evitado porque equivale ao AltGr no teclado ABNT2.
- **Abrir no hub:** cria os espaços reservados na hora e abre os perfis 3 de cada vez em paralelo.
  Cada janela nasce no **bastidor** (`SetWinEventHook EVENT_OBJECT_SHOW` + varredura a cada 30 ms
  como rede de segurança), é reconhecida pelo PID e acende no seu espaço.
- **Fechar o hub:** esconde (`SW_HIDE`) os navegadores no mesmo instante, antes de soltar o dono, e
  só depois encerra os processos em segundo plano. Quem foi tirado com × continua aberto.

### Armadilhas encontradas

- **O Firefox se reposiciona sozinho** logo depois de abrir. Por isso existe a vigia. Sem ela, um
  navegador "ficava para fora" do hub.
- **Janela maximizada ignora `SetWindowPos`.** É preciso restaurá-la antes (`SW_SHOWNOACTIVATE`).
  Daí veio o "maximizar = solo".
- **O Camoufox ignora o tamanho gravado no `xulstore.json`** e abre com cerca de 1600x1300. Por isso
  o "abrir já no lugar" virou bastidor.
- **O aviso `EVENT_OBJECT_SHOW` às vezes não chega** para a 1ª janela de perfis que já guardam
  posição. A varredura de 30 ms cobre isso e registra no `errors.log` quando pega algo.
- **Janela que passou pelo bastidor fica preta** até ser clicada, porque o Firefox pausa a pintura
  fora da tela. A correção é um "cutucão" depois de encaixar (encolher 1 px e voltar, mais
  `RedrawWindow`), em 120 ms e 900 ms.
- **koffi + `GetWindowRect`:** use uma struct (`RinoRECT`). Um array `int32_t*` derruba o processo
  Electron sem erro.
- **Estilo global de `button`** no app (`min-height: 34px`) inflava as pílulas da barra. Elas usam
  `min-height: 0`.
- **Limite pela tela virtual do perfil:** existe (`capToVirtualScreen`) mas está **desligado** por
  decisão do usuário. Com o limite, perfis de resolução menor não preenchiam o espaço (58–80% na
  bateria). O risco aceito é uma janela maior que a "tela" do perfil nos modos foco e solo.

### Limitações conhecidas

- Perfis que **já estavam abertos** antes do "Abrir no hub" entram com o "pulo" antigo, porque já
  estavam visíveis na tela.
- Enquanto há perfis carregando, uma janela nova (`Ctrl+N`) num navegador que já está no hub pode ir
  para o bastidor e só voltar em até 30 s.
- O clique na pílula de dentro do navegador não é coberto pelo teste automático (só o lado do hub,
  por arquivo de sinal).

## Testes

| Comando | Cobre |
|---|---|
| `npm run test:pill` | Injeção no `.cfg`: idempotência, troca de versão, sandbox, ASCII |
| `npm run test:hub-layout` | Layout puro: grade, foco, scroll, solo, mínimos, sem sobreposição |
| `npm run test:hub` | Ponta a ponta com navegadores reais: bastidor sem janela fora do hub, foco, solo, coladas, sinal da pílula, arrastar e soltar, fechar junto, reabrir perfis com posição salva |
| `npx electron scripts/test-hub-behavior.js [semlimite] [n=6]` | Bateria: quanto cada janela preenche sua célula em cada modo |
| `npm run test:detect` | Garante que nada disso mudou o fingerprint |

## Histórico (commits)

| Commit | O quê |
|---|---|
| `9d7dad5` | Pílula com o nome do perfil |
| `cc61849` | Hub de navegadores (layout, vigia, pílulas, bastidor, sinais, testes) |
| `d4a4e3b` | Abrir e fechar como uma coisa só (varredura de 30 ms, cutucão, esconder ao fechar) |
| `3b37f17` | Tela física real no fingerprint com escala ≠ 100% (`scaleFactor`) |
| `c1dccbf` | Botões da janela e fonte da interface padronizados em perfis macOS/Linux |
