'use strict';
// Testa o cálculo do layout do Hub (puro, sem abrir navegador).
const { computeLayout, MIN_W, MIN_H, MIN_SIDE_H } = require('../src/hub/layout');

let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log(`  ${ok ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); };
const ids = (n) => Array.from({ length: n }, (_, i) => 'p' + (i + 1));
const AREA = { x: 0, y: 50, width: 2400, height: 1300 };
const inside = (r, a) => r.x >= a.x && r.y >= a.y && r.x + r.width <= a.x + a.width && r.y + r.height <= a.y + a.height;
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const noOverlap = (rects) => rects.every((a, i) => rects.every((b, j) => i === j || !overlap(a, b)));
const rows = (rects) => new Set(rects.map((r) => r.y)).size;

console.log('[1] grade');
const one = computeLayout(AREA, ids(1));
check('1 navegador ocupa a área toda', one.rects[0].width === AREA.width && one.rects[0].height === AREA.height);
const two = computeLayout(AREA, ids(2));
check('2 → lado a lado (1 linha)', rows(two.rects) === 1 && two.rects.length === 2);
const four = computeLayout(AREA, ids(4));
check('4 → grade 2x2', rows(four.rects) === 2 && four.rects.length === 4);
const five = computeLayout(AREA, ids(5));
check('5 → 3+2, última linha esticada', rows(five.rects) === 2 && five.rects[3].width > five.rects[0].width);
const six = computeLayout(AREA, ids(6));
check('6 → 3x2', rows(six.rects) === 2 && six.rects.length === 6);
for (const n of [1, 2, 3, 5, 6, 7, 9]) {
  const l = computeLayout(AREA, ids(n));
  check(`${n}: dentro da área e sem sobreposição`, l.rects.every((r) => inside(r, AREA)) && noOverlap(l.rects));
}

console.log('\n[2] mínimo de tamanho → fila de excedentes');
const many = computeLayout(AREA, ids(20));
check('20 não cabem: sobra vai pro overflow', many.overflow.length > 0 && many.rects.length + many.overflow.length === 20);
check('todos os visíveis respeitam o mínimo', many.rects.every((r) => r.width >= MIN_W && r.height >= MIN_H));
check('ordem preservada (overflow = os últimos)', many.overflow[many.overflow.length - 1] === 'p20');

console.log('\n[3] foco (priorizar)');
const focus = computeLayout(AREA, ids(5), { mode: 'focus', priorityId: 'p3' });
check('priorizado vem primeiro e é o maior', focus.rects[0].id === 'p3' && focus.rects.slice(1).every((r) => r.width * r.height < focus.rects[0].width * focus.rects[0].height));
check('priorizado ocupa ~70% da largura', Math.abs(focus.rects[0].width - AREA.width * 0.7) <= 1);
check('demais empilhados à direita', focus.rects.slice(1).every((r) => r.x > focus.rects[0].x + focus.rects[0].width - 1));
check('foco: dentro da área e sem sobreposição', focus.rects.every((r) => inside(r, AREA)) && noOverlap(focus.rects));
const focusMany = computeLayout(AREA, ids(12), { mode: 'focus', priorityId: 'p1' });
check('foco com 12: coluna lateral respeita altura mínima', focusMany.rects.slice(1).every((r) => r.height >= MIN_SIDE_H) && focusMany.overflow.length > 0);
// Bug real (bateria 2026-10-07): monitor 1080p a 125% → área ~1875x965; com 4 perfis o 4º sumia no foco.
const focus4 = computeLayout({ x: 0, y: 0, width: 1875, height: 965 }, ids(4), { mode: 'focus', priorityId: 'p1' });
check('foco com 4 numa tela 1080p: ninguém some', focus4.rects.length === 4 && focus4.overflow.length === 0, JSON.stringify(focus4.overflow));
const focus6 = computeLayout({ x: 0, y: 0, width: 1875, height: 965 }, ids(6), { mode: 'focus', priorityId: 'p1' });
check('foco com 6 numa tela 1080p: ninguém some', focus6.rects.length === 6 && focus6.overflow.length === 0, JSON.stringify(focus6.overflow));
check('foco com priorityId inexistente cai no primeiro', computeLayout(AREA, ids(3), { mode: 'focus', priorityId: 'x' }).rects[0].id === 'p1');

const solo = computeLayout(AREA, ids(4), { mode: 'solo', priorityId: 'p2' });
check('solo: priorizado ocupa a área toda', solo.rects.length === 1 && solo.rects[0].id === 'p2' && solo.rects[0].width === AREA.width && solo.rects[0].height === AREA.height);
check('solo: demais vão para fora de cena', solo.overflow.length === 3 && !solo.overflow.includes('p2'));

console.log('\n[3b] scroll da lateral no foco');
const A1080 = { x: 0, y: 0, width: 1875, height: 965 };
const noScroll = computeLayout(A1080, ids(4), { mode: 'focus', priorityId: 'p1', stripH: 35 });
check('cabem todos → sem faixa de scroll', !noScroll.strip && noScroll.overflow.length === 0);
const sc0 = computeLayout(A1080, ids(10), { mode: 'focus', priorityId: 'p1', stripH: 35 });
check('9 na lateral não cabem → faixa de scroll no pé', !!sc0.strip && sc0.strip.total === 9 && sc0.strip.from === 1);
check('faixa fica abaixo das miniaturas, dentro da área', sc0.rects.slice(1).every((r) => r.y + r.height <= sc0.strip.y) && sc0.strip.y + sc0.strip.height <= A1080.height);
const shown0 = sc0.rects.slice(1).map((r) => r.id);
const sc1 = computeLayout(A1080, ids(10), { mode: 'focus', priorityId: 'p1', stripH: 35, sideOffset: 2 });
check('rolar 2 → começa na 3ª miniatura', sc1.rects[1].id === 'p4' && sc1.strip.from === 3);
check('priorizado continua o grande ao rolar', sc1.rects[0].id === 'p1' && sc1.rects[0].width === sc0.rects[0].width);
const scMax = computeLayout(A1080, ids(10), { mode: 'focus', priorityId: 'p1', stripH: 35, sideOffset: 99 });
check('rolar além do fim trava na última página', scMax.strip.to === 9 && scMax.sideOffset === 9 - shown0.length);
check('visíveis + fora de cena = todos', sc1.rects.length + sc1.overflow.length === 10);

console.log('\n[4] tela virtual do perfil (antidetect)');
const capped = computeLayout(AREA, ids(1), { maxSize: { p1: { width: 1366, height: 768 } } });
const c = capped.rects[0];
check('janela nunca passa da tela virtual', c.width === 1366 && c.height === 768);
check('sobra centralizada', c.x === Math.floor((AREA.width - 1366) / 2) && c.y === AREA.y + Math.floor((AREA.height - 768) / 2));

console.log('\n[5] entradas vazias');
check('sem perfis → nada', computeLayout(AREA, []).rects.length === 0);
check('área zerada (hub minimizado) → tudo no overflow', computeLayout({ x: 0, y: 0, width: 0, height: 0 }, ids(3)).overflow.length === 3);

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
