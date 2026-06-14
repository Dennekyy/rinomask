'use strict';

// Helpers de interação humana (digitação, rolagem, dwell, clique tolerante).
// O movimento de cursor já é humanizado nativamente pelo Camoufox (humanize:true).

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tempo de "leitura"/pausa entre ações.
async function dwell(min = 1500, max = 4000) { await sleep(rand(min, max)); }

// Digita um texto tecla-a-tecla com cadência variável (e foca o campo antes).
async function humanType(page, locator, text) {
  const el = locator.first();
  await el.click({ timeout: 8000 }).catch(() => {});
  await sleep(rand(200, 600));
  for (const ch of text) {
    await page.keyboard.type(ch).catch(() => {});
    await sleep(rand(55, 175));
    if (Math.random() < 0.04) await sleep(rand(300, 700)); // hesitação ocasional
  }
}

// Rola a página em etapas (como alguém lendo).
async function humanScroll(page, rounds) {
  rounds = rounds || rand(3, 7);
  for (let i = 0; i < rounds; i++) {
    await page.mouse.wheel(0, rand(300, 820)).catch(() => {});
    await sleep(rand(450, 1500));
    if (Math.random() < 0.2) { await page.mouse.wheel(0, -rand(120, 300)).catch(() => {}); await sleep(rand(400, 900)); } // volta um pouco
  }
}

// Clica se existir; retorna true/false sem lançar.
async function clickMaybe(page, locator, timeout = 6000) {
  try { await locator.first().click({ timeout }); return true; } catch (e) { return false; }
}

module.exports = { rand, sleep, dwell, humanType, humanScroll, clickMaybe };
