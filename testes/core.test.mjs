import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hojeEmBrasilia, somarDias, diasEntre, numeroDoJogo, msAteAmanha, geradorDoDia } from '#core/dia.js';
import { calcularEstatisticas } from '#core/progresso.js';

test('o dia vira à meia-noite de Brasília, não à de Greenwich', () => {
  assert.equal(hojeEmBrasilia(new Date('2026-10-20T02:59:00Z')), '2026-10-19');
  assert.equal(hojeEmBrasilia(new Date('2026-10-20T03:00:00Z')), '2026-10-20');
});

test('contas com datas', () => {
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(diasEntre('2026-02-27', '2026-03-01'), 2);
  assert.equal(numeroDoJogo('2026-11-01', '2026-11-01'), 1);
  assert.equal(numeroDoJogo('2026-11-12', '2026-11-01'), 12);
  assert.equal(msAteAmanha(new Date('2026-10-20T02:00:00Z')), 3600000);
});

test('o sorteio é igual para todos no mesmo dia', () => {
  const a = geradorDoDia('jogo:2026-10-20');
  const b = geradorDoDia('jogo:2026-10-20');
  const c = geradorDoDia('jogo:2026-10-21');
  const sa = [a(), a(), a()];
  assert.deepEqual(sa, [b(), b(), b()]);
  assert.notDeepEqual(sa, [c(), c(), c()]);
});

const jogo = (valor = 7) => ({ valor });

test('sequência conta dias jogados seguidos', () => {
  const historico = { '2026-10-17': jogo(), '2026-10-18': jogo(2), '2026-10-19': jogo(10) };
  const est = calcularEstatisticas(historico, '2026-10-19');
  assert.equal(est.sequencia, 3);
  assert.equal(est.melhorSequencia, 3);
  assert.equal(est.jogos, 3);
});

test('a sequência continua viva até o fim do dia seguinte', () => {
  const historico = { '2026-10-18': jogo(), '2026-10-19': jogo() };
  assert.equal(calcularEstatisticas(historico, '2026-10-20').sequencia, 2);
  assert.equal(calcularEstatisticas(historico, '2026-10-21').sequencia, 0);
});

test('pular um dia zera a sequência, mas guarda o recorde', () => {
  const historico = {
    '2026-10-01': jogo(), '2026-10-02': jogo(), '2026-10-03': jogo(), '2026-10-04': jogo(),
    '2026-10-06': jogo(), '2026-10-07': jogo(),
  };
  const est = calcularEstatisticas(historico, '2026-10-07');
  assert.equal(est.sequencia, 2);
  assert.equal(est.melhorSequencia, 4);
});

test('a semana vai de segunda a domingo', () => {
  const est = calcularEstatisticas({ '2026-10-19': jogo() }, '2026-10-21'); // 19/10/2026 é segunda
  assert.equal(est.semana[0].dia, '2026-10-19');
  assert.equal(est.semana[0].jogou, true);
  assert.equal(est.semana[2].hoje, true);
  assert.equal(est.semana[6].dia, '2026-10-25');
});
