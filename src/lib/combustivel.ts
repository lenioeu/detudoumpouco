// Álcool (etanol) ou gasolina: qual sai mais barato por quilômetro.

/** Regra geral: o etanol rende cerca de 70% da gasolina no mesmo carro. */
export const LIMITE_PADRAO = 0.7;

/** Custo para rodar 1 km, em reais. */
export const custoPorKm = (precoLitro: number, kmPorLitro: number) => precoLitro / kmPorLitro;

export interface Comparacao {
  /** Preço do etanol dividido pelo da gasolina. */
  razao: number;
  /** Razão a partir da qual a gasolina passa a compensar (0,7 ou consumo etanol ÷ consumo gasolina). */
  limite: number;
  compensa: 'etanol' | 'gasolina' | 'tanto faz';
  /** Preço máximo do etanol para ainda valer a pena. */
  etanolMaximo: number;
  /** Custo por km de cada um, só quando o consumo do carro foi informado. */
  custoKm: { etanol: number; gasolina: number } | null;
}

/**
 * Compara os combustíveis. Sem o consumo do carro, usa a regra dos 70%.
 * Com o consumo (km/l) de cada um, o limite passa a ser consumoEtanol ÷ consumoGasolina.
 */
export function compararCombustiveis(precoEtanol: number, precoGasolina: number, consumoEtanol?: number | null, consumoGasolina?: number | null): Comparacao | null {
  if (precoEtanol <= 0 || precoGasolina <= 0) return null;
  const temConsumo = !!consumoEtanol && !!consumoGasolina && consumoEtanol > 0 && consumoGasolina > 0;
  const limite = temConsumo ? consumoEtanol! / consumoGasolina! : LIMITE_PADRAO;
  const razao = precoEtanol / precoGasolina;
  // Diferença menor que meio centavo no preço equivalente conta como empate.
  const diferenca = precoEtanol - limite * precoGasolina;
  const compensa = Math.abs(diferenca) < 0.005 ? 'tanto faz' : diferenca < 0 ? 'etanol' : 'gasolina';
  return {
    razao, limite, compensa,
    etanolMaximo: limite * precoGasolina,
    custoKm: temConsumo ? { etanol: custoPorKm(precoEtanol, consumoEtanol!), gasolina: custoPorKm(precoGasolina, consumoGasolina!) } : null,
  };
}
