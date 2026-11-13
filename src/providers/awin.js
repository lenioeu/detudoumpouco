const VERTICAL = 'retail';

function parsePrice(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const match = String(value).match(/[\d.,]+/);
  if (!match) return null;
  return parseFloat(match[0].replace(',', '.'));
}

function toDeal({ advertiserId, storeName }, item) {
  const price = parsePrice(item.price);
  const salePrice = parsePrice(item.sale_price);
  if (!price || !salePrice || salePrice >= price) return null;

  const discountPct = ((price - salePrice) / price) * 100;

  return {
    store: storeName ?? `Awin:${advertiserId}`,
    externalId: item.id,
    title: item.title,
    url: item.link,
    price: salePrice,
    originalPrice: price,
    discountPct,
    image: item.image_link
  };
}

async function fetchAdvertiserFeed({ publisherId, accessToken, locale, advertiser }) {
  const url = `https://api.awin.com/publishers/${publisherId}/awinfeeds/download/${advertiser.advertiserId}-${VERTICAL}-${locale}.jsonl`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return [];

  const text = await res.text();
  const deals = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let item;
    try {
      item = JSON.parse(line);
    } catch {
      continue;
    }
    const deal = toDeal(advertiser, item);
    if (deal) deals.push(deal);
  }
  return deals;
}

export async function fetchDeals({ publisherId, accessToken, locale = 'pt_BR', advertisers }) {
  if (!publisherId || !accessToken || !advertisers?.length) return [];

  const results = await Promise.all(
    advertisers.map((advertiser) =>
      fetchAdvertiserFeed({ publisherId, accessToken, locale, advertiser })
    )
  );
  return results.flat();
}
