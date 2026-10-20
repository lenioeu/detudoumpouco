import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { sortearRodadas, rodadasDoDia, RODADAS } from '../sites/quantocustava/js/sorteio.js';

// Itens fictícios só para testar as regras do sorteio (não são usados no jogo).
const itensDeTeste = [];
const grupos = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
for (const [g, grupo] of grupos.entries()) {
  for (let ano = 1995; ano <= 2025; ano += 3) {
    itensDeTeste.push({ id: `${grupo}-${ano}`, grupo, mes: `${ano}-07`, preco: 1, hoje: 10 + g * 3 + (ano % 7) });
  }
}

test('sorteia dez rodadas sem repetir itens', () => {
  const pares = sortearRodadas(itensDeTeste, '2026-10-20');
  assert.equal(pares.length, RODADAS);
  const ids = pares.flat();
  assert.equal(new Set(ids).size, ids.length);
});

test('cada grupo aparece no máximo quatro vezes por dia', () => {
  const pares = sortearRodadas(itensDeTeste, '2026-10-21');
  const contagem = {};
  for (const id of pares.flat()) {
    const grupo = id.split('-')[0];
    contagem[grupo] = (contagem[grupo] ?? 0) + 1;
  }
  assert.ok(Object.values(contagem).every((n) => n <= 4));
});

test('as disputas não são empates nem fáceis demais', () => {
  const porId = new Map(itensDeTeste.map((i) => [i.id, i]));
  for (const [a, b] of sortearRodadas(itensDeTeste, '2026-10-22')) {
    const [x, y] = [porId.get(a).hoje, porId.get(b).hoje];
    const razao = Math.max(x, y) / Math.min(x, y);
    assert.ok(razao >= 1.15 && razao <= 3, `razão ${razao}`);
  }
});

test('o calendário publicado manda; sem ele, sorteia', () => {
  const dados = { itens: itensDeTeste };
  const calendario = { '2026-10-20': [['a-1995', 'b-2001']] };
  const doCalendario = rodadasDoDia(dados, calendario, '2026-10-20');
  assert.equal(doCalendario.length, 1);
  assert.equal(doCalendario[0].a.id, 'a-1995');
  assert.equal(rodadasDoDia(dados, calendario, '2026-10-23').length, RODADAS);
});

test('a resposta certa é o item mais caro em dinheiro de hoje', () => {
  for (const r of rodadasDoDia({ itens: itensDeTeste }, {}, '2026-10-24')) {
    const certo = r.certo === 'a' ? r.a : r.b;
    const outro = r.certo === 'a' ? r.b : r.a;
    assert.ok(certo.hoje >= outro.hoje);
  }
});

const arquivoReal = new URL('../sites/quantocustava/dados/itens.json', import.meta.url);
test('dados reais: todo item tem fonte e o calendário fecha', { skip: !existsSync(arquivoReal) }, () => {
  const dados = JSON.parse(readFileSync(arquivoReal, 'utf8'));
  assert.ok(dados.itens.length > 50);
  for (const item of dados.itens) {
    assert.ok(item.fonte && item.url && Number.isFinite(item.hoje) && item.hoje > 0, item.id);
  }
  const calendario = JSON.parse(readFileSync(new URL('../sites/quantocustava/dados/calendario.json', import.meta.url), 'utf8'));
  for (const [dia, pares] of Object.entries(calendario)) {
    assert.equal(pares.length, RODADAS, `dia ${dia}`);
  }
});
