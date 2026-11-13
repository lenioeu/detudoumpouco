import 'dotenv/config';
import { readFile } from 'fs/promises';
import { connect } from '../src/connection.js';
import { collectDeals } from '../src/providers/index.js';
import { selectDealsToPost } from '../src/deals/filter.js';
import { formatDealMessage } from '../src/deals/format.js';
import { openDealStore } from '../src/deals/dealStore.js';

const MIN_DISCOUNT_PCT = Number(process.env.MIN_DISCOUNT_PCT ?? 30);
const MAX_POSTS_PER_CYCLE = Number(process.env.MAX_POSTS_PER_CYCLE ?? 3);

async function notifySite(deal) {
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
        image: deal.image,
        postedAt: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error('Falha ao avisar o site:', err.message);
  }
}

export async function runCycle(sock) {
  const channelFile = new URL('../channel.json', import.meta.url).pathname;
  const { jid } = JSON.parse(await readFile(channelFile, 'utf8'));

  const dealStore = await openDealStore();
  const deals = await collectDeals();
  const toPost = selectDealsToPost(deals, {
    minDiscountPct: MIN_DISCOUNT_PCT,
    maxPerCycle: MAX_POSTS_PER_CYCLE,
    dealStore
  });

  for (const deal of toPost) {
    const text = formatDealMessage(deal);
    if (deal.image) {
      await sock.sendMessage(jid, { image: { url: deal.image }, caption: text });
    } else {
      await sock.sendMessage(jid, { text });
    }
    dealStore.markPosted(deal);
    await notifySite(deal);
    console.log(`Publicado: ${deal.title} (${Math.round(deal.discountPct)}% off, ${deal.store})`);
  }

  await dealStore.persist();

  if (toPost.length === 0) {
    console.log('Nenhum achado novo acima do desconto mínimo neste ciclo.');
  }

  return toPost.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sock = await connect();
  await runCycle(sock);
  setTimeout(() => sock.end(undefined), 1000);
}
