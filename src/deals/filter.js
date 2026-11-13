// price <= 0 ou desconto perto de 100% costuma ser erro de feed da loja
// (preço zerado), não desconto real.
const MAX_SANE_DISCOUNT_PCT = 95;

export function selectDealsToPost(deals, { minDiscountPct, maxPerCycle, dealStore }) {
  return deals
    .filter((deal) => deal.price > 0 && deal.discountPct <= MAX_SANE_DISCOUNT_PCT)
    .filter((deal) => deal.discountPct >= minDiscountPct)
    .filter((deal) => !dealStore.wasPosted(deal))
    .sort((a, b) => b.discountPct - a.discountPct)
    .slice(0, maxPerCycle);
}
