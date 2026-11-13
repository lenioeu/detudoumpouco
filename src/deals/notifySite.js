export async function notifySite(deal) {
  const { SITE_API_URL, SITE_API_SECRET } = process.env;
  if (!SITE_API_URL || !SITE_API_SECRET) return;

  try {
    await fetch(SITE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-promozap-secret': SITE_API_SECRET },
      body: JSON.stringify({
        id: `${deal.store}:${deal.externalId}`,
        store: deal.store,
        title: deal.title,
        url: deal.url,
        price: deal.price,
        originalPrice: deal.originalPrice,
        discountPct: deal.discountPct,
        image: deal.image ?? null,
        category: deal.category ?? null,
        postedAt: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error('Falha ao avisar o site:', err.message);
  }
}
