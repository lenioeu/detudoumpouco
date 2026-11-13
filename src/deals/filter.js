// price <= 0 ou desconto perto de 100% costuma ser erro de feed da loja
// (preço zerado), não desconto real.
const MAX_SANE_DISCOUNT_PCT = 95;

// Retorna todos os candidatos elegíveis, ordenados por desconto — sem cortar em
// maxPerCycle ainda, porque alguns podem falhar ao gerar link de afiliado (loja
// não aprovada) e precisam ser pulados sem "gastar" uma vaga do ciclo.
export function selectCandidates(deals, { minDiscountPct, dealStore }) {
  return deals
    .filter((deal) => deal.price > 0 && deal.discountPct <= MAX_SANE_DISCOUNT_PCT)
    .filter((deal) => deal.discountPct >= minDiscountPct)
    .filter((deal) => !dealStore.wasPosted(deal))
    .sort((a, b) => b.discountPct - a.discountPct);
}
