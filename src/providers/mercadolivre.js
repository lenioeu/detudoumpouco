const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
const SEARCH_URL = 'https://api.mercadolibre.com/sites/MLB/search';

async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!res.ok) {
    throw new Error(`Falha ao renovar token do Mercado Livre: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

function toDeal(item) {
  const price = item.price;
  const originalPrice = item.original_price;
  if (!originalPrice || !price || originalPrice <= price) return null;

  const discountPct = ((originalPrice - price) / originalPrice) * 100;

  return {
    store: 'Mercado Livre',
    externalId: item.id,
    title: item.title,
    url: item.permalink,
    price,
    originalPrice,
    discountPct,
    image: item.thumbnail
  };
}

export async function fetchDeals({ clientId, clientSecret, refreshToken, queries }) {
  if (!clientId || !clientSecret || !refreshToken || !queries?.length) return [];

  const { access_token } = await getAccessToken({ clientId, clientSecret, refreshToken });

  const deals = [];
  for (const q of queries) {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&limit=50`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!res.ok) continue;
    const { results } = await res.json();
    for (const item of results ?? []) {
      const deal = toDeal(item);
      if (deal) deals.push(deal);
    }
  }
  return deals;
}
