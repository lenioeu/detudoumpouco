import { buildDomainMap, affiliateReplace } from './affiliateMatch.js';
import { openDealStore } from './deals/dealStore.js';

function messageText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    ''
  );
}

// Escuta grupos do WhatsApp configurados em MIRROR_GROUP_JIDS, troca o link do
// produto pelo link de afiliado (via Lomadee, quando a loja é aprovada) e
// repassa a mensagem pro canal próprio. Mensagens de lojas não aprovadas ou
// sem link reconhecido são ignoradas.
export async function startMirror(sock, { targetJid, apiKey, groupJids }) {
  if (!groupJids?.length) {
    console.log('Mirror (WhatsApp): nenhum MIRROR_GROUP_JIDS configurado, desligado.');
    return;
  }

  const domainByHost = await buildDomainMap(apiKey);
  const dealStore = await openDealStore('mirror-whatsapp');

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        const jid = msg.key.remoteJid;
        if (msg.key.fromMe || !groupJids.includes(jid)) continue;

        const text = messageText(msg);
        const result = await affiliateReplace(text, { apiKey, domainByHost });
        if (!result) continue;

        const dedupeKey = { store: result.brand.name, externalId: result.originalUrl };
        if (dealStore.wasPosted(dedupeKey)) continue;

        await sock.sendMessage(targetJid, { text: result.text });
        dealStore.markPosted(dedupeKey);
        await dealStore.persist();
        console.log(`Mirror (WhatsApp): repassado um achado de ${result.brand.name}.`);
      } catch (err) {
        console.error('Mirror (WhatsApp): erro processando mensagem:', err.message);
      }
    }
  });

  console.log(`Mirror (WhatsApp): ativo, escutando ${groupJids.length} grupo(s).`);
}
