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
- **Diagnóstico** — log de erros automático em disco, para correções futuras.
- **Aviso de atualização** — o app compara a própria versão com a publicada aqui no GitHub
  e avisa quando há uma nova.

## Requisitos

- Windows 10/11 (o empacotamento e a marca do navegador são focados em Windows).
- Node.js 18+ (testado com Node 26) para rodar a partir do código.

## Rodando a partir do código

```bash
npm install        # Electron + Playwright; baixa o rcedit (marca do navegador)
npm start          # abre a janela do RinoMask
```

Na **primeira execução**, o app baixa o motor Camoufox (~530 MB) — o instalador é enxuto e
não traz o motor embutido.

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
- `errors.log` — log de diagnóstico.

Excluir um perfil definitivamente remove a pasta `profiles/<id>` inteira.

## Testes

```bash
npm run test:ui          # interface (abre o app e exercita os botões)
npm run test:advanced    # overrides de fingerprint + tamanho de janela + humanize
npm run test:warm        # aquecedor (pesquisa real, assiste vídeo, mede maturidade)
npm run test:manual      # abre o Camoufox real, rastreia e fecha
npm run test:vault       # criptografia em repouso
npm run test:trust       # trust score
```

Os testes que carregam o motor rodam sob o ABI do Electron via `node scripts/_enode.js <script>`.

## Uso responsável

Feito para gerenciar as **suas próprias contas** (agência, social media, e-commerce, QA,
verificação de anúncios, privacidade). Respeite os Termos de Uso de cada plataforma e a lei.
