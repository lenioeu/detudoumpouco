import { listBrands, resolveAffiliateUrl } from './providers/lomadee.js';
import { openDealStore } from './deals/dealStore.js';

const URL_REGEX = /https?:\/\/[^\s]+/gi;

function hostnameOf(url) {
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withScheme).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function messageText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    ''
  );
}

async function buildDomainMap(apiKey) {
  const brands = await listBrands({ apiKey });
  const map = new Map();
  for (const brand of brands) {
    if (!brand.approved || !brand.site) continue;
    const host = hostnameOf(brand.site);
    if (host) map.set(host, brand);
  }
  return map;
}

// Escuta grupos do WhatsApp configurados em MIRROR_GROUP_JIDS, troca o link do
// produto pelo link de afiliado (via Lomadee, quando a loja é aprovada) e
// repassa a mensagem pro canal próprio. Mensagens de lojas não aprovadas ou
// sem link reconhecido são ignoradas.
export async function startMirror(sock, { targetJid, apiKey, groupJids }) {
  if (!groupJids?.length) {
    console.log('Mirror: nenhum MIRROR_GROUP_JIDS configurado, espelhamento desligado.');
    return;
  }

  const domainByHost = await buildDomainMap(apiKey);
  const dealStore = await openDealStore('mirror');

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        const jid = msg.key.remoteJid;
        if (msg.key.fromMe || !groupJids.includes(jid)) continue;

        const text = messageText(msg);
        const url = text.match(URL_REGEX)?.[0];
        if (!url) continue;

        const host = hostnameOf(url);
        const brand = host && domainByHost.get(host);
        if (!brand) {
          console.log(`Mirror: ignorando link de domínio não aprovado (${host}).`);
          continue;
        }

        const dedupeKey = { store: brand.name, externalId: url };
        if (dealStore.wasPosted(dedupeKey)) continue;

        const affiliateUrl = await resolveAffiliateUrl({ apiKey, organizationId: brand.organizationId, url });
        if (!affiliateUrl) {
          console.log(`Mirror: Lomadee não gerou link para "${brand.name}", pulando.`);
          continue;
        }

        const novoTexto = text.replace(url, affiliateUrl);
        await sock.sendMessage(targetJid, { text: novoTexto });
        dealStore.markPosted(dedupeKey);
        await dealStore.persist();
        console.log(`Mirror: repassado um achado de ${brand.name}.`);
      } catch (err) {
        console.error('Mirror: erro processando mensagem:', err.message);
      }
    }
  });

  console.log(`Mirror: ativo, escutando ${groupJids.length} grupo(s).`);
}
