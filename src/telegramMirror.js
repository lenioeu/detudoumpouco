import { buildDomainMap, affiliateReplace } from './affiliateMatch.js';
import { openDealStore } from './deals/dealStore.js';

// Escuta canais/grupos do Telegram configurados (TELEGRAM_CHANNELS), troca o
// link do produto pelo link de afiliado (via Lomadee, quando a loja é
// aprovada) e chama onMatch com o texto pronto pra publicar. Mensagens de
// lojas não aprovadas ou sem link reconhecido são ignoradas.
export async function startTelegramMirror(telegramClient, { onMatch, apiKey, channels }) {
  if (!channels?.length) {
    console.log('Mirror (Telegram): nenhum TELEGRAM_CHANNELS configurado, desligado.');
    return;
  }

  const domainByHost = await buildDomainMap(apiKey);
  const dealStore = await openDealStore('mirror-telegram');

  const handler = async (update) => {
    try {
      const text = update.message?.message ?? '';
      if (!text) return;

      const result = await affiliateReplace(text, { apiKey, domainByHost });
      if (!result) return;

      const dedupeKey = { store: result.brand.name, externalId: result.originalUrl };
      if (dealStore.wasPosted(dedupeKey)) return;

      await onMatch(result);
      dealStore.markPosted(dedupeKey);
      await dealStore.persist();
      console.log(`Mirror (Telegram): repassado um achado de ${result.brand.name}.`);
    } catch (err) {
      console.error('Mirror (Telegram): erro processando mensagem:', err.message);
    }
  };

  for (const channel of channels) {
    telegramClient.updates.watch(channel, handler);
  }

  console.log(`Mirror (Telegram): ativo, escutando ${channels.length} canal(is)/grupo(s).`);
}
