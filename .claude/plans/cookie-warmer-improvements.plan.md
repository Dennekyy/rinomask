# Plan: Melhorar o Aquecedor de Cookies (Cookie Robot)

**Source**: /ecc:plan conversacional (2026-06-19) — "estude a arquitetura do aquecedor e melhore todo o processo"
**Escopo TRAVADO para esta entrega**: Fases 1+2 **com UI**
**Complexity**: Medium
**Status**: DONE (2026-06-19) — Fases 1+2+UI implementadas e validadas (test-warm-content 20/20, test:ui 32/32, test:warm 14/14). Fases 3–5 seguem adiadas (ver "Próximos passos").

## Decisões do usuário (confirmadas)
- Escopo agora: **Fases 1+2 (coerência por locale + maturidade real + relatório) + UI**.
- UI incluída = **exibir o relatório de aquecimento** (padrão do relatório de detecção) + breakdown de maturidade no tooltip 🍪 da lista.
- **Seletor de intensidade NÃO entra agora** (é Fase 3, adiada). Não confundir com a opção de UI escolhida.

## Arquitetura atual (estudada)
- `electron/main.js:69` `warmProfile(id)`: abre navegador visível (headless só em teste via `RINOMASK_HEADLESS=1`), roda jornada, mede, fecha. Tetos: `BUDGET=4min`, `HARD=BUDGET+60s` (Promise.race), `killer=BUDGET+120s` (setTimeout). **Manter essas garantias.**
- `src/cookieRobot.js`: `warmUp(page,{niche,budgetMs,onProgress})` → `buildJourney` (busca→vídeo→1-2 leituras→destino) + `measureWarmth(ctx,visited)`. Consentimento híbrido robusto (`acceptConsent` + `dismissConsentInFrame`, PT/EN/ES, shadow DOM/iframes).
- `src/humanInput.js`: humanType/humanScroll/dwell/clickMaybe.
- IPC: `cookieRobot.run` (single) / `cookieRobot.runMany` (sequencial `for…await`).
- Persistência: `store.setWarmth(id,{score,cookies,domains,visited,at})`.

## Lacunas (motivação)
- **G1 (Alto):** conteúdo sempre pt-BR/Brasil (`QUERIES`/`SITES`/`VIDEO_Q` hardcoded), **ignora `locale`/`region`/proxy-geo** → incoerência (perfil US aquecendo com "cotação do dólar"+g1.globo.com). Fere o valor central. Ver memória [[rinomask-camoufox-native-injection]].
- **G2 (Médio):** `measureWarmth` raso (só cookies/domínios/etapas; sem 1st/3rd-party, persistente vs sessão, localStorage/IndexedDB).
- **G3 (Médio):** sem `warmReport` (só o score é salvo; ≠ `detectReport`).

## Padrões a espelhar
| Categoria | Fonte | Padrão |
|---|---|---|
| Persistir relatório | `store.js:268` `setDetectReport` | criar `setWarmReport` idêntico |
| Erro por etapa | `cookieRobot.js:~323` `catch{}` | etapa que falha não derruba a jornada |
| Diagnóstico/progresso | `errorLog.log({source,message,stack,context})` / `emit('warm:progress')` | manter |
| Exibir relatório na UI | bloco do `detect`/relatório de detecção em `renderer/app.js` | espelhar para warmReport |
| Teste | `scripts/test-warm.js` via `_enode.js` | `check()`, pass/fail, `process.exit`, headless |

## Files to Change
| File | Action | Why |
|---|---|---|
| `src/warmContent.js` | CREATE | Pools busca/vídeo/sites por **locale** (`pt-BR`,`en-US`,`en-GB`,`es-ES`) × nicho; `pickPool(locale,niche)`. |
| `src/cookieRobot.js` | UPDATE | `warmUp` aceita `locale`/`region` e usa `pickPool`; `measureWarmth` enriquecido (`v=2`); jornada usa pools coerentes. |
| `electron/main.js` | UPDATE | `warmProfile` passa `locale=prof.fingerprint.locale`, `region=prof.fingerprint.timezone`; persiste `warmReport` (domínios, consentimentos, status por etapa, duração). |
| `src/store.js` | UPDATE | `setWarmReport(id,data)` espelhando `setDetectReport`; export no module.exports. |
| `renderer/app.js` | UPDATE | exibir relatório de aquecimento (padrão do detect) + breakdown no tooltip 🍪. |
| `scripts/test-warm.js` | UPDATE | assert coerência de locale + forma do `warmReport` + `measureWarmth v=2`. |
| `scripts/test-warm-content.js` | CREATE | teste PURO (sem motor): `pickPool` por locale e scoring determinístico. |

## Tasks
### Task 1: warmContent.js (Fase 1)
- Action: extrair/expandir pools para `LOCALE_POOLS[locale][niche] = {q, vq, sites, engine, home}`; `pickPool(locale,niche)` com fallback `niche→default`, `locale→pt-BR`.
- Mirror: estrutura de `NICHES` atual em cookieRobot.js.
- Validate: `node scripts/test-warm-content.js`.

### Task 2: warmUp usa locale (Fase 1)
- Action: `warmUp(page,{niche,locale,region,budgetMs,onProgress})` → `pickPool(locale,niche)`; jornada (busca/vídeo/leitura/destino) consome o pool; `searchEngine` respeita `pool.engine`.
- Mirror: `buildJourney` atual.
- Validate: `npm run test:warm` (coerência de locale).

### Task 3: measureWarmth v2 + warmReport (Fase 2)
- Action: enriquecer `measureWarmth` (1st/3rd-party, persistente vs sessão, localStorage/IndexedDB via `page.evaluate`, variedade TLD; `score` recalibrado, `v:2`). `warmUp` retorna também `report` (visited domains, consents, steps[{label,ok,ms}]).
- Mirror: `setDetectReport`/`detect` report shape.
- Validate: `node scripts/test-warm-content.js` (scoring) + `npm run test:warm`.

### Task 4: persistir + main.js (Fase 2)
- Action: `store.setWarmReport`; `warmProfile` passa locale/region e salva `warmReport`; emitir no `warm:done`.
- Validate: `npm run test:warm`.

### Task 5: UI (Fase 2 — incluída)
- Action: exibir relatório de aquecimento no app (modal/painel como o de detecção) + breakdown no tooltip 🍪 da linha.
- Mirror: bloco de exibição do detectReport em `renderer/app.js`.
- Validate: `npm run test:ui` (passos de UI; lembrar do fix do seletor `.modal input:not([type=file])` já aplicado).

## Validation
```bash
node scripts/test-warm-content.js          # NOVO: puro/rápido (sem motor) — pickPool + scoring
node --check src/cookieRobot.js src/warmContent.js electron/main.js src/store.js
npm run test:warm                          # termina no teto + cookies>0 + coerência locale (precisa motor+display)
npm run debug:warm                         # observação manual
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Drift de seletores Google/YouTube/consent | Alta | try/catch por etapa (já há); variedade de sites |
| `measureWarmth` v2 quebra comparação de scores antigos | Média | `warmth.v=2`; aceitar recalibração |
| Pools por locale viram manutenção | Média | pools pequenos/resilientes; falha de site não derruba etapa |
| Introduzir stealth por JS por engano | — | PROIBIDO — só navegação/conteúdo; ver [[rinomask-camoufox-native-injection]] |

## Acceptance
- [x] Conteúdo de aquecimento coerente com `locale`/`region` do perfil (não mais sempre pt-BR)
- [x] `measureWarmth` v2 (1st/3rd-party, persistente/sessão, storage, TLD) e `warmReport` persistido
- [x] UI exibe relatório de aquecimento + breakdown 🍪
- [x] `test-warm-content.js` verde; `test:warm` termina no teto com cookies>0
- [x] Tetos de término preservados; zero injeção por JS

## Próximos passos (Fases 3–5) — CONCLUÍDAS (2026-06-19)
- [x] **Fase 3 — Intensidade + meta + variedade:** presets `leve(~2min)`/`medio(~4min)`/`profundo(~9min)` em `warmContent.resolveIntensity`; `warmProfile` deriva `BUDGET`/`HARD`/`killer` da intensidade (garantia de término preservada); `warmUp({targetScore})` repete passadas até a maturidade ≥ alvo ou o teto; `store.setWarmVisited` rastreia domínios recém-visitados e `avoidFilter` diversifica entre execuções. **Seletor de intensidade + meta na UI (`openWarmDialog`).**
- [x] **Fase 4 — Resiliência:** `searchEngine` com cadeia Google→Bing→DuckDuckGo (cai para o próximo se a caixa some); top-up de leitura garante `MIN_DOMAINS=4` distintos mesmo com YouTube/Google degradados; status por etapa (`steps[{label,ok,ms}]`) no report.
- [x] **Fase 5 — Concorrência:** `runManyWarm` com pool configurável (default 1, cap 3); UI passa `concurrency` no diálogo de lote.

### Validação 3–5
`test-warm-content.js` **29/29** (intensidade + avoidFilter) · `test:ui` **32/32** · `test:warm` **15/15** (passes ≥ 1, busca resiliente) · `node --check` OK.
