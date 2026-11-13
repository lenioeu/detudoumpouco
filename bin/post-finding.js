import { readFile } from 'fs/promises';
import { connect } from '../src/connection.js';

const text = process.argv[2];

if (!text) {
  console.error('Uso: npm run post -- "texto do achado"');
  process.exit(1);
}

const channelFile = new URL('../channel.json', import.meta.url).pathname;
let jid;
try {
  ({ jid } = JSON.parse(await readFile(channelFile, 'utf8')));
} catch {
  console.error('channel.json não encontrado. Rode primeiro: npm run setup-channel -- "Nome do Canal"');
  process.exit(1);
}

const sock = await connect();
await sock.sendMessage(jid, { text });
console.log('Achado publicado no canal.');

setTimeout(() => sock.end(undefined), 1000);
