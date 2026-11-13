const BASE_URL = 'https://api.lomadee.com.br';

function storeName(product, option) {
  if (option.seller) return option.seller;
  try {
    return new URL(product.url).hostname.replace(/^www\./, '');
  } catch {
    return 'Lomadee';
  }
}

async function lomadeeGet(apiKey, path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }
  const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
  if (!res.ok) throw new Error(`Lomadee ${path} -> ${res.status}`);
  return res.json();
}

function toDeal(product, categoryByOrg) {
  const option = product.options?.[0];
  const pricing = option?.pricing?.[0];
  if (!option || !pricing || !pricing.listPrice || pricing.listPrice <= pricing.price) return null;

  // A doc descreve listPrice/price como centavos, mas a API em produção devolve
  // reais em ponto flutuante (ex: 66.9) — já testado com a chave real.
  const price = pricing.price;
  const originalPrice = pricing.listPrice;
  const discountPct = ((originalPrice - price) / originalPrice) * 100;

  return {
    source: 'lomadee',
    organizationId: product.organizationId,
    store: storeName(product, option),
    category: categoryByOrg.get(product.organizationId) ?? null,
    externalId: product.id,
    title: product.name,
    url: product.url,
    price,
    originalPrice,
    discountPct,
    image: product.images?.[0]?.url ?? option.images?.[0]?.url
  };
}

export async function listBrands({ apiKey, maxPages = 10 }) {
  const brands = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data, pagination } = await lomadeeGet(apiKey, '/affiliate/brands', { page, limit: 20 });
    if (!data?.length) break;

    for (const brand of data) {
      const channel = brand.channels?.[0];
      const approved = Boolean(channel?.availableChannel?.shortUrls?.length ?? channel?.shortUrls?.length);
      brands.push({
        organizationId: brand.id,
        name: brand.name,
        segment: brand.segment ?? null,
        exclusive: Boolean(brand.trait?.isExclusive),
        approved,
        message: channel?.message ?? null
      });
    }

    if (!pagination || page >= pagination.totalPages) break;
  }
  return brands;
}

async function categoryMapByOrg(apiKey) {
  const brands = await listBrands({ apiKey });
  return new Map(brands.map((brand) => [brand.organizationId, brand.segment]));
}

export async function fetchDeals({ apiKey, search, maxPages = 10 }) {
  if (!apiKey) return [];

  const categoryByOrg = await categoryMapByOrg(apiKey);

  const deals = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data } = await lomadeeGet(apiKey, '/affiliate/products', {
      page,
      limit: 100,
      isAvailable: true,
      search
    });
    if (!data?.length) break;

    for (const product of data) {
      const deal = toDeal(product, categoryByOrg);
      if (deal) deals.push(deal);
    }

    if (data.length < 100) break;
  }
  return deals;
}

export async function resolveAffiliateUrl({ apiKey, organizationId, url }) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/affiliate/shortener/url`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId, type: 'Custom', url })
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const channels = await res.json();
  return channels.find((channel) => channel.shortUrls?.length)?.shortUrls[0] ?? null;
}
