/** Formata um valor em reais: 1234.5 → "R$ 1.234,50". */
export function reais(n: number): string {
  // Evita "-R$ 0,00" quando a conta dá um resíduo minúsculo negativo.
  const v = Math.abs(n) < 0.005 ? 0 : n;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Valor com duas casas e sem o "R$", para tabelas: 1234.5 → "1.234,50". */
export function centavos(n: number): string {
  const v = Math.abs(n) < 0.005 ? 0 : n;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
