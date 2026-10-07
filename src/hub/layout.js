'use strict';

// Cálculo PURO do layout do Hub: dado a área disponível, os perfis e o modo, devolve o retângulo
// de cada navegador. Sem efeitos colaterais (testado em scripts/test-hub-layout.js).
//  - grade: colunas = ceil(√n); a última linha, se incompleta, estica para ocupar a largura toda.
//  - foco:  o priorizado ocupa FOCUS_RATIO da largura à esquerda; os demais em grade na coluna direita.
// Janelas abaixo do tamanho mínimo quebram os sites → os excedentes vão para `overflow` (fila).
// `maxSize` por id (tela virtual do perfil): a janela nunca passa disso, senão o site veria
// janela > tela (incoerência de fingerprint) — a sobra fica centralizada na célula.

const FOCUS_RATIO = 0.7;
const MIN_W = 480;
const MIN_H = 360;
const MIN_SIDE_H = 180;      // foco: laterais são "miniaturas vivas"; com 360 só cabiam 2 e o 4º sumia (1080p: até 6 no foco)
const GAP = 2;

function gridCells(area, n) {
  if (n <= 0) return [];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellH = Math.floor((area.height - GAP * (rows - 1)) / rows);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
    const cellW = Math.floor((area.width - GAP * (inRow - 1)) / inRow);
    for (let c = 0; c < inRow; c++) {
      cells.push({ x: area.x + c * (cellW + GAP), y: area.y + r * (cellH + GAP), width: cellW, height: cellH });
    }
  }
  return cells;
}

// Quantos cabem na área respeitando o mínimo (testa n, n-1, ... até caber; sempre ao menos 1).
function fitCount(area, n) {
  for (let k = n; k > 1; k--) {
    const cells = gridCells(area, k);
    if (cells.every((c) => c.width >= MIN_W && c.height >= MIN_H)) return k;
  }
  return Math.min(n, 1);
}

function clampToMax(cell, max) {
  if (!max) return cell;
  const width = Math.min(cell.width, max.width || cell.width);
  const height = Math.min(cell.height, max.height || cell.height);
  return { x: cell.x + Math.floor((cell.width - width) / 2), y: cell.y + Math.floor((cell.height - height) / 2), width, height };
}

/**
 * @param {{x:number,y:number,width:number,height:number}} area
 * @param {string[]} ids  ordem de exibição
 * @param {{mode?:'grid'|'focus'|'solo', priorityId?:string, maxSize?:Object<string,{width:number,height:number}>,
 *          sideOffset?:number, stripH?:number}} [opts]
 *   sideOffset: no foco, a partir de qual miniatura a lateral começa (scroll);
 *   stripH: altura da faixa de scroll reservada no pé da lateral quando nem todas cabem.
 * @returns {{ rects: Array<{id:string,x:number,y:number,width:number,height:number}>, overflow: string[],
 *             strip?: {x:number,y:number,width:number,height:number,from:number,to:number,total:number}, sideOffset?: number }}
 */
function computeLayout(area, ids, opts = {}) {
  const { mode = 'grid', priorityId = null, maxSize = {}, sideOffset = 0, stripH = 0 } = opts;
  if (!ids.length || area.width <= 0 || area.height <= 0) return { rects: [], overflow: [...ids] };
  const ordered = priorityId && ids.includes(priorityId) ? [priorityId, ...ids.filter((i) => i !== priorityId)] : [...ids];
  const place = (id, cell) => ({ id, ...clampToMax(cell, maxSize[id]) });

  // solo ("maximizar dentro do hub"): o priorizado ocupa a área toda; os demais saem de cena.
  if (mode === 'solo') return { rects: [place(ordered[0], area)], overflow: ordered.slice(1) };

  if (mode === 'focus' && ordered.length > 1) {
    const mainW = Math.floor(area.width * FOCUS_RATIO);
    const side = { x: area.x + mainW + GAP, y: area.y, width: area.width - mainW - GAP, height: area.height };
    const rest = ordered.slice(1);
    // Na coluna lateral só empilha (1 coluna): cabem quantos respeitarem a altura mínima.
    const fits = (h) => Math.max(1, Math.floor((h + GAP) / (MIN_SIDE_H + GAP)));
    // Não cabem todos → reserva a faixa de scroll no pé da lateral e mostra uma "janela" deslizante.
    const scrolls = stripH > 0 && rest.length > fits(side.height);
    const colH = scrolls ? side.height - stripH - GAP : side.height;
    const k = Math.min(rest.length, fits(colH));
    const offset = Math.max(0, Math.min(sideOffset, rest.length - k));
    const shown = rest.slice(offset, offset + k);
    const cellH = Math.floor((colH - GAP * (k - 1)) / k);
    const cells = shown.map((_, i) => ({ x: side.x, y: side.y + i * (cellH + GAP), width: side.width, height: cellH }));
    const out = {
      rects: [place(ordered[0], { x: area.x, y: area.y, width: mainW, height: area.height }), ...shown.map((id, i) => place(id, cells[i]))],
      overflow: rest.filter((id) => !shown.includes(id)),
      sideOffset: offset,
    };
    if (scrolls) out.strip = { x: side.x, y: side.y + colH + GAP, width: side.width, height: stripH, from: offset + 1, to: offset + k, total: rest.length };
    return out;
  }

  const k = fitCount(area, ordered.length);
  const cells = gridCells(area, k);
  return { rects: ordered.slice(0, k).map((id, i) => place(id, cells[i])), overflow: ordered.slice(k) };
}

module.exports = { computeLayout, gridCells, FOCUS_RATIO, MIN_W, MIN_H, MIN_SIDE_H, GAP };
