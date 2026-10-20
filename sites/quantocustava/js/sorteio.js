// Sorteio das rodadas do dia. Função pura: roda no navegador e no Node.

import { geradorDoDia, embaralhar } from '#core/dia.js';

export const RODADAS = 10;
const RAZAO_MIN = 1.15; // abaixo disso a disputa fica "no chute"
const RAZAO_MAX = 3;    // acima disso fica fácil demais
const MAX_POR_GRUPO = 4; // um mesmo tipo de item aparece no máximo 4 vezes por dia

/** Devolve [[idA, idB], ...] com RODADAS pares para o dia. */
export function sortearRodadas(itens, dia) {
  const aleatorio = geradorDoDia(`quantocustava:${dia}`);
  const ordenados = itens.slice().sort((x, y) => x.id.localeCompare(y.id));
  const fila = embaralhar(ordenados, aleatorio);
  const usados = new Set();
  const porGrupo = {};
  const pares = [];

  const podeUsar = (item) => !usados.has(item.id) && (porGrupo[item.grupo] ?? 0) < MAX_POR_GRUPO;
  const marcar = (item) => {
    usados.add(item.id);
    porGrupo[item.grupo] = (porGrupo[item.grupo] ?? 0) + 1;
  };

  for (const a of fila) {
    if (pares.length === RODADAS) break;
    if (!podeUsar(a)) continue;
    const b = fila.find((c) => {
      if (c === a || !podeUsar(c)) return false;
      if (c.grupo === a.grupo && (porGrupo[a.grupo] ?? 0) + 2 > MAX_POR_GRUPO) return false;
      const razao = Math.max(a.hoje, c.hoje) / Math.min(a.hoje, c.hoje);
      return razao >= RAZAO_MIN && razao <= RAZAO_MAX && a.mes.slice(0, 4) !== c.mes.slice(0, 4);
    });
    if (!b) continue;
    marcar(a);
    marcar(b);
    pares.push(aleatorio() < 0.5 ? [a.id, b.id] : [b.id, a.id]);
  }
  return pares;
}

/** Pares do dia: usa o calendário publicado e, se faltar o dia, sorteia na hora. */
export function rodadasDoDia(dados, calendario, dia) {
  const porId = new Map(dados.itens.map((i) => [i.id, i]));
  const doCalendario = calendario?.[dia];
  const pares = doCalendario && doCalendario.every((p) => p.every((id) => porId.has(id)))
    ? doCalendario
    : sortearRodadas(dados.itens, dia);
  return pares.map(([a, b]) => {
    const itemA = porId.get(a);
    const itemB = porId.get(b);
    return { a: itemA, b: itemB, certo: itemA.hoje >= itemB.hoje ? 'a' : 'b' };
  });
}
