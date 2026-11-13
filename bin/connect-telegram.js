import 'dotenv/config';
import { connectTelegram } from '../src/telegramClient.js';

const { TELEGRAM_API_ID, TELEGRAM_API_HASH } = process.env;
if (!TELEGRAM_API_ID || !TELEGRAM_API_HASH) {
  console.error('Preencha TELEGRAM_API_ID e TELEGRAM_API_HASH no .env (pegue em my.telegram.org).');
  process.exit(1);
}

const client = await connectTelegram({ apiId: TELEGRAM_API_ID, apiHash: TELEGRAM_API_HASH });
console.log('Conectado como:', await client.getMe());
await client.disconnect();
