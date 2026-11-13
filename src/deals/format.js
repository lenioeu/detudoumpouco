function formatPrice(value) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

export function formatDealMessage(deal) {
  const pct = Math.round(deal.discountPct);
  return [
    `🔥 *${deal.title}*`,
    '',
    `De ${formatPrice(deal.originalPrice)} por *${formatPrice(deal.price)}* (${pct}% OFF)`,
    `Loja: ${deal.store}`,
    '',
    deal.url
  ].join('\n');
}
