# RinoMask 🦏

Navegador antidetect de **desktop** para gerenciar várias contas com perfis totalmente
isolados — no espírito do Dolphin Anty, mas com o motor **Camoufox** (Firefox com injeção
de fingerprint em nível nativo, C++) em vez de injeção por JavaScript.

Não é serviço web nem nuvem: é um app Electron com janela própria, roda local, e cada
perfil é um Firefox real, com sua própria memória (cookies, login, cache, histórico).

> Licença proprietária — veja `LICENSE`. O código está visível, mas copiar, redistribuir
> ou criar derivados sem autorização não é permitido.

## Por que Camoufox

A fingerprint é aplicada dentro do C++ do Firefox, então não dá para detectar via
JavaScript (nada de `getOwnPropertyDescriptor(...).get.toString()` entregando getters
forjados). Workers e iframes ficam coerentes, e como é Firefox não existe o problema de
`Sec-CH-UA` (Client Hints) que entrega navegadores baseados em Chromium.

## Recursos

- **Gerência visual em tabela** — status, tags, SO, proxy e último uso por linha.
- **Status coloridos** (Novo, Pronto, Ativo, Aquecendo, Banido, Pausado) + customizados.
- **Tags**, **pastas** para agrupar e **fixar** perfis no topo; busca e filtros.
- **Ações em massa** — abrir/parar vários, mudar status, aplicar tag, mover, atribuir proxy, excluir.
- **Clonar** perfil em N cópias com fingerprint randomizada e coerente.
- **Perfil rápido** (1 clique) ou **editor avançado** de fingerprint: SO, idioma/região,
  resolução, CPU, geolocalização (auto pelo proxy / manual / desligada), fuso, WebRTC,
  cursor humanizado, bloquear imagens e Do Not Track.
- **Coerência proxy → identidade automática** — com um proxy atribuído, fuso, idioma,
  geolocalização e o IP do WebRTC são derivados do GeoIP do proxy (Camoufox spoofa o WebRTC).
- **Biblioteca de proxies** — salve, teste (mostra IP de saída) e importe em massa
  (`type://user:pass@host:port`, `host:port:user:pass`, `host:port`). SOCKS5 com auth via bridge local.
- **Aquecedor (Cookie Robot)** — abre o perfil, pesquisa no Google/Bing, assiste vídeos no
  YouTube, explora o Maps e navega por dezenas de sites de forma aleatória e humana,
  acumulando cookies/histórico legítimos; ao terminar, fecha sozinho.
- **Maturidade do perfil** (🍪) — nota 0–100 do quão "vivido" está o perfil (cookies, domínios, sites).
- **Trust score** (🛡) — autoteste de indetectabilidade da fingerprint (Camoufox dá 100/100).
- **Vault** — senha-mestra (scrypt) + criptografia AES-256-GCM dos dados em repouso.
- **Cookies** — exportar/importar por perfil.
- **Lixeira** — exclusão reversível; a definitiva apaga toda a memória do perfil.
- **Sincronizador** — espelha as ações de um perfil mestre nos demais.
- **Pílula de identidade** — cada navegador mostra no topo uma pílula com o nome do perfil
  (o mesmo do RinoMask). Botão direito troca a cor; a cor fica salva no próprio perfil. Vive só
  na interface do navegador — os sites não enxergam.
- **Hub de navegadores** — reúne todos os navegadores abertos numa janela só, que se reorganiza
  sozinha conforme a quantidade:
  - **Grade** (todos iguais) ou **Foco** (o priorizado grande, os demais empilhados ao lado, com
    scroll quando não cabem); maximizar um navegador o expande no hub inteiro.
  - Priorizar: clique na pílula da barra do hub, na pílula de dentro do navegador, arraste uma
    janela sobre outra para trocá-las, ou `Alt+1…9` (`Alt+0` alterna grade/foco).
  - **Abrir no hub**: espaços reservados aparecem na hora e os navegadores abrem em segundo plano,
    "acendendo" já no lugar certo. Fechar o hub fecha junto os navegadores que estão nele.
  - Detalhes técnicos e decisões em [`docs/HUB-E-PILULA.md`](docs/HUB-E-PILULA.md).
- **Interface padronizada** — perfis macOS/Linux têm os botões da janela e a fonte da interface
  iguais aos de Windows (sem afetar o fingerprint de fontes do perfil).
- **Diagnóstico** — log de erros automático em disco, para correções futuras.
- **Aviso de atualização** — o app compara a própria versão com a publicada aqui no GitHub
  e avisa quando há uma nova.

## Requisitos

- Windows 10/11 (o empacotamento e a marca do navegador são focados em Windows).
- Node.js 18+ (testado com Node 22 e 24) para rodar a partir do código.
- O hub usa `koffi` (FFI pré-compilado, sem compilação) para controlar janelas do Windows.

## Rodando a partir do código

```bash
npm install        # Electron + Playwright; baixa o rcedit (marca do navegador)
npm start          # abre a janela do RinoMask
```

Rodando a partir do código, se o motor Camoufox (~530 MB) ainda não estiver nesta máquina, o app
oferece baixá-lo. O **instalador já traz o motor embutido** (copiado para o pacote no `npm run dist`).

Ao iniciar, o app prepara o motor de forma idempotente: marca do RinoMask no `camoufox.exe`
(`src/branding.js`) e o bloco da pílula/interface no `camoufox.cfg` (`src/pill.js`).

## Gerar o instalador

```bash
npm run dist       # electron-builder → dist/RinoMask Setup <versão>.exe (NSIS)
```

O `.exe` gerado pode ser instalado em outro PC/VM. Ele não é assinado, então o SmartScreen
pode avisar "editor desconhecido" — é só clicar em "Mais informações → Executar assim mesmo".

## Onde ficam os dados

Tudo em `app.getPath('userData')` do Electron (`%APPDATA%/RinoMask/`):

- `store.json` — perfis, proxies, pastas, status, tags (criptografado quando há vault).
- `profiles/<id>/userdata/` — memória persistente de cada navegador.
- `errors.log` — log de diagnóstico (inclui avisos do hub, ex.: janela que o bastidor não reconheceu).
- Dentro de `profiles/<id>/userdata/`, além do Firefox:
  - `user.js` — regravado a cada abertura (proxy, prefs do fingerprint, `rinomask.profile.name`);
  - `prefs.js` → `rinomask.pill.color` — a cor escolhida na pílula (persiste; nunca vai no `user.js`);
  - `rinomask-hub.member` / `rinomask-hub.signal` — ponte com o Hub (só um timestamp cada).

Excluir um perfil definitivamente remove a pasta `profiles/<id>` inteira.

## Testes

```bash
npm run test:ui          # interface (abre o app e exercita os botões)
npm run test:advanced    # overrides de fingerprint + tamanho de janela + humanize
npm run test:warm        # aquecedor (pesquisa real, assiste vídeo, mede maturidade)
npm run test:manual      # abre o Camoufox real, rastreia e fecha
npm run test:vault       # criptografia em repouso
npm run test:trust       # trust score
npm run test:pill        # injeção da pílula no camoufox.cfg (idempotência, ASCII)
npm run test:hub-layout  # cálculo do layout do hub (grade, foco, scroll, solo)
npm run test:hub         # hub de ponta a ponta com navegadores reais (~2 min, abre janelas)
npm run test:detect      # auditoria de detecção (rodar após mexer em algo que toca o navegador)
```

Bateria de comportamento do hub (mede quanto cada janela preenche sua célula em cada modo):
`npx electron scripts/test-hub-behavior.js [semlimite] [n=6]`.

Os testes que carregam o motor rodam sob o ABI do Electron via `node scripts/_enode.js <script>`.

## Uso responsável

Feito para gerenciar as **suas próprias contas** (agência, social media, e-commerce, QA,
verificação de anúncios, privacidade). Respeite os Termos de Uso de cada plataforma e a lei.
