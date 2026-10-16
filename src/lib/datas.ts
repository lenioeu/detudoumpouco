// Datas do calendário a partir do mês atual, para gráficos e tabelas que avançam mês a mês.
import { duracao } from './amortizacao';

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Mês (0–11) e ano daqui a `t` meses, contando a partir de `inicio` (padrão: hoje). */
export function mesDaqui(t: number, inicio = new Date()) {
  const m = inicio.getMonth() + t;
  return { mes: ((m % 12) + 12) % 12, ano: inicio.getFullYear() + Math.floor(m / 12) };
}

/** "out/2027" */
export const mesAno = (t: number, inicio?: Date) => { const d = mesDaqui(t, inicio); return `${MESES[d.mes]}/${d.ano}`; };

/** Texto do ponto no gráfico: "Hoje (out/2026)" ou "fev/2029 · 2 anos e 4 meses". */
export const rotuloData = (t: number) => (t === 0 ? `Hoje (${mesAno(0)})` : `${mesAno(t)} · ${duracao(t)}`);

/**
 * Rótulos do eixo x: meses ("jan/27") em prazos de até 2 anos; anos do calendário em prazos longos,
 * em intervalos redondos (1, 2, 5 ou 10 anos), maiores quando a tela é estreita.
 */
export function marcaCalendario(estreito: boolean) {
  return (i: number, n: number): string | null => {
    if (i === 0) return 'Hoje';
    const d = mesDaqui(i);
    if (n <= 24) return d.mes % 3 === 0 ? `${MESES[d.mes]}/${String(d.ano).slice(2)}` : null;
    const anos = n / 12;
    const passo = anos <= 10 ? (estreito ? 2 : 1) : anos <= 20 ? (estreito ? 5 : 2) : anos <= 30 ? (estreito ? 10 : 5) : 10;
    return d.mes === 0 && d.ano % passo === 0 ? String(d.ano) : null;
  };
}
