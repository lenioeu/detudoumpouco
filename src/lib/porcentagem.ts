/** Quanto é `p`% de `v`. */
export const porcentoDe = (p: number, v: number) => (p / 100) * v;

/** `a` é quantos por cento de `b`. */
export const quantoPorcento = (a: number, b: number) => (b === 0 ? null : (a / b) * 100);

/** `v` com aumento (p > 0) ou desconto (p < 0) de `p`%. */
export const aplicarPorcentagem = (v: number, p: number) => v * (1 + p / 100);

/** Variação percentual de `de` para `para`. */
export const variacao = (de: number, para: number) => (de === 0 ? null : ((para - de) / Math.abs(de)) * 100);
