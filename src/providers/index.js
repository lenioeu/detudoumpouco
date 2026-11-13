import { fetchDeals as fetchMercadoLivre } from './mercadolivre.js';
import { fetchDeals as fetchAwin } from './awin.js';
import { fetchDeals as fetchLomadee } from './lomadee.js';

function parseAdvertisers(raw) {
  if (!raw) return [];
  return raw.split(',').map((entry) => {
    const [advertiserId, storeName] = entry.split(':');
    return { advertiserId: advertiserId.trim(), storeName: storeName?.trim() };
  });
}

export async function collectDeals(env = process.env) {
  const [mercadoLivreDeals, awinDeals, lomadeeDeals] = await Promise.all([
    fetchMercadoLivre({
      clientId: env.MERCADOLIVRE_CLIENT_ID,
      clientSecret: env.MERCADOLIVRE_CLIENT_SECRET,
      refreshToken: env.MERCADOLIVRE_REFRESH_TOKEN,
      queries: env.MERCADOLIVRE_QUERIES?.split(',').map((q) => q.trim()).filter(Boolean)
    }),
    fetchAwin({
      publisherId: env.AWIN_PUBLISHER_ID,
      accessToken: env.AWIN_ACCESS_TOKEN,
      locale: env.AWIN_LOCALE,
      advertisers: parseAdvertisers(env.AWIN_ADVERTISERS)
    }),
    fetchLomadee({
      apiKey: env.LOMADEE_API_KEY,
      search: env.LOMADEE_SEARCH
    })
  ]);

  return [...mercadoLivreDeals, ...awinDeals, ...lomadeeDeals];
}
