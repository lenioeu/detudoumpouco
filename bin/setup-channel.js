import { writeFile } from 'fs/promises';
import { connect } from '../src/connection.js';

const name = process.argv[2];
const description = process.argv[3] ?? 'Achados de engenharia reversa / pesquisa, publicados automaticamente.';

if (!name) {
  console.error('Uso: npm run setup-channel -- "Nome do Canal" ["Descrição"]');
  process.exit(1);
}

const sock = await connect();
const metadata = await sock.newsletterCreate(name, description);

const channelFile = new URL('../channel.json', import.meta.url).pathname;
await writeFile(channelFile, JSON.stringify({ jid: metadata.id, name: metadata.name }, null, 2));

console.log(`Canal criado: ${metadata.name}`);
console.log(`JID salvo em channel.json: ${metadata.id}`);

setTimeout(() => sock.end(undefined), 1000);
