import 'dotenv/config';
import { readFile } from 'fs/promises';
import { connect } from '../src/connection.js';
import { collectDeals } from '../src/providers/index.js';
import { selectCandidates } from '../src/deals/filter.js';
import { formatDealMessage } from '../src/deals/format.js';
import { openDealStore } from '../src/deals/dealStore.js';
import { resolveAffiliateUrl as resolveLomadeeUrl } from '../src/providers/lomadee.js';

const MIN_DISCOUNT_PCT = Number(process.env.MIN_DISCOUNT_PCT ?? 5);
const MAX_POSTS_PER_CYCLE = Number(process.env.MAX_POSTS_PER_CYCLE ?? 3);
const MAX_CANDIDATES_TRIED = MAX_POSTS_PER_CYCLE * 10;

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
        category: deal.category ?? null,
        postedAt: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error('Falha ao avisar o site:', err.message);
  }
}

// Sem sock, publica só no site (não mexe com WhatsApp). O histórico de cada
// canal é independente: publicar no site agora não impede de publicar no
// WhatsApp depois, quando o número estiver conectado.
export async function runCycle(sock) {
  let jid;
  if (sock) {
    const channelFile = new URL('../channel.json', import.meta.url).pathname;
    ({ jid } = JSON.parse(await readFile(channelFile, 'utf8')));
  }

  const dealStore = await openDealStore(sock ? 'whatsapp' : 'site');
  const deals = await collectDeals();
  const candidates = selectCandidates(deals, { minDiscountPct: MIN_DISCOUNT_PCT, dealStore });

  let posted = 0;
  for (const deal of candidates.slice(0, MAX_CANDIDATES_TRIED)) {
    if (posted >= MAX_POSTS_PER_CYCLE) break;

    if (deal.source === 'lomadee') {
      const affiliateUrl = await resolveLomadeeUrl({
        apiKey: process.env.LOMADEE_API_KEY,
        organizationId: deal.organizationId,
        url: deal.url
      });
      if (!affiliateUrl) {
        console.error(`Lomadee não gerou link de afiliado para "${deal.title}", pulando.`);
        continue;
      }
      deal.url = affiliateUrl;
    }

    if (sock) {
      const text = formatDealMessage(deal);
      if (deal.image) {
        await sock.sendMessage(jid, { image: { url: deal.image }, caption: text });
      } else {
        await sock.sendMessage(jid, { text });
      }
    }
    dealStore.markPosted(deal);
    await notifySite(deal);
    console.log(`Publicado: ${deal.title} (${Math.round(deal.discountPct)}% off, ${deal.store})`);
    posted++;
  }

  await dealStore.persist();

  if (posted === 0) {
    console.log('Nenhum achado novo acima do desconto mínimo neste ciclo.');
  }

  return posted;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sock = await connect();
  await runCycle(sock);
  setTimeout(() => sock.end(undefined), 1000);
}
