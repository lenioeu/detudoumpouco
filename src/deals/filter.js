export function selectDealsToPost(deals, { minDiscountPct, maxPerCycle, dealStore }) {
  return deals
    .filter((deal) => deal.discountPct >= minDiscountPct)
    .filter((deal) => !dealStore.wasPosted(deal))
    .sort((a, b) => b.discountPct - a.discountPct)
    .slice(0, maxPerCycle);
}
