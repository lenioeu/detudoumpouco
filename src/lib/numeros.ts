/** Lê um número digitado no formato brasileiro ("1.234,56") ou internacional ("1234.56"). */
export function lerNumero(texto: string): number | null {
  let t = texto.trim().replace(/\s/g, '').replace(/^R\$/i, '').replace(/%$/, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  // "1.000" e "2.500.000" sem vírgula são milhares no padrão brasileiro.
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Formata no padrão brasileiro, com até `casas` casas decimais. */
export function formatar(n: number, casas = 2): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}
