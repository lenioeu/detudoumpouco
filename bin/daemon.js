import 'dotenv/config';
import { readFile } from 'fs/promises';
import cron from 'node-cron';
import { connect } from '../src/connection.js';
import { runCycle } from './run-cycle.js';
import { startMirror } from '../src/mirror.js';
import { connectTelegram } from '../src/telegramClient.js';
import { startTelegramMirror } from '../src/telegramMirror.js';

const SCHEDULE = process.env.CRON_SCHEDULE ?? '0 */2 * * *';

const sock = await connect();
console.log(`Daemon ativo. Ciclo de publicação: "${SCHEDULE}" (cron).`);

cron.schedule(SCHEDULE, () => {
  runCycle(sock).catch((err) => console.error('Erro no ciclo de publicação:', err));
});

const channelFile = new URL('../channel.json', import.meta.url).pathname;
const { jid: canalJid } = JSON.parse(await readFile(channelFile, 'utf8'));
const groupJids = (process.env.MIRROR_GROUP_JIDS ?? '').split(',').map((jid) => jid.trim()).filter(Boolean);

await startMirror(sock, { targetJid: canalJid, apiKey: process.env.LOMADEE_API_KEY, groupJids });

const { TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_CHANNELS } = process.env;
const channels = (TELEGRAM_CHANNELS ?? '').split(',').map((c) => c.trim()).filter(Boolean);

let telegramClient;
if (TELEGRAM_API_ID && TELEGRAM_API_HASH && channels.length) {
  telegramClient = await connectTelegram({ apiId: TELEGRAM_API_ID, apiHash: TELEGRAM_API_HASH });
  await startTelegramMirror(telegramClient, {
    apiKey: process.env.LOMADEE_API_KEY,
    channels,
    onMatch: ({ text }) => sock.sendMessage(canalJid, { text })
  });
}

process.on('SIGTERM', () => {
  sock.end(undefined);
  telegramClient?.disconnect();
});
process.on('SIGINT', () => {
  sock.end(undefined);
  telegramClient?.disconnect();
});
