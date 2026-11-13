// price <= 0 ou desconto perto de 100% costuma ser erro de feed da loja
// (preço zerado), não desconto real.
const MAX_SANE_DISCOUNT_PCT = 95;

// Descontos dentro da mesma faixa de 15 pontos percentuais contam como
// "parecidos" — dentro da faixa, loja principal entra na frente.
const DISCOUNT_BUCKET_SIZE = 15;

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function parseMainStores(raw) {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((name) => normalize(name))
      .filter(Boolean)
  );
}

// Retorna todos os candidatos elegíveis, ordenados — sem cortar em maxPerCycle
// ainda, porque alguns podem falhar ao gerar link de afiliado (loja não
// aprovada) e precisam ser pulados sem "gastar" uma vaga do ciclo.
export function selectCandidates(deals, { minDiscountPct, dealStore, mainStores }) {
  const mainStoreSet = parseMainStores(mainStores);
  const isMainStore = (deal) => mainStoreSet.has(normalize(deal.store));

  return deals
    .filter((deal) => deal.price > 0 && deal.discountPct <= MAX_SANE_DISCOUNT_PCT)
    .filter((deal) => deal.discountPct >= minDiscountPct)
    .filter((deal) => !dealStore.wasPosted(deal))
    .sort((a, b) => {
      const bucketA = Math.floor(a.discountPct / DISCOUNT_BUCKET_SIZE);
      const bucketB = Math.floor(b.discountPct / DISCOUNT_BUCKET_SIZE);
      if (bucketA !== bucketB) return bucketB - bucketA;

      const mainA = isMainStore(a) ? 1 : 0;
      const mainB = isMainStore(b) ? 1 : 0;
      if (mainA !== mainB) return mainB - mainA;

      return b.discountPct - a.discountPct;
    });
}
