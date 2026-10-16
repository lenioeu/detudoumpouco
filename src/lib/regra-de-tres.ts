// Regra de três simples e composta.

/**
 * Regra de três simples: "a está para b, assim como c está para x".
 * Direta: x = b·c / a. Inversa (uma sobe, a outra desce): x = a·b / c.
 * Devolve null quando a conta divide por zero.
 */
export function regraDeTresSimples(a: number, b: number, c: number, inversa = false): number | null {
  if (inversa) return c === 0 ? null : (a * b) / c;
  return a === 0 ? null : (b * c) / a;
}

export interface Grandeza {
  /** Valor na situação conhecida. */
  antigo: number;
  /** Valor na situação nova. */
  novo: number;
  /** true quando é inversamente proporcional à grandeza que se quer descobrir. */
  inversa: boolean;
}

export interface ResultadoComposta {
  x: number;
  /** Fator que cada grandeza aplica sobre o valor conhecido (novo/antigo ou antigo/novo). */
  fatores: { numerador: number; denominador: number }[];
}

/**
 * Regra de três composta: x = valorConhecido × Π fator, em que o fator é novo/antigo para
 * grandezas diretas e antigo/novo para inversas. Devolve null se algum denominador for zero.
 */
export function regraDeTresComposta(valorConhecido: number, grandezas: Grandeza[]): ResultadoComposta | null {
  const fatores = grandezas.map((g) => (g.inversa ? { numerador: g.antigo, denominador: g.novo } : { numerador: g.novo, denominador: g.antigo }));
  if (fatores.some((f) => f.denominador === 0)) return null;
  const x = fatores.reduce((acc, f) => (acc * f.numerador) / f.denominador, valorConhecido);
  return { x, fatores };
}
