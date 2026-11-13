import 'dotenv/config';
import { listBrands } from '../src/providers/lomadee.js';

const brands = await listBrands({ apiKey: process.env.LOMADEE_API_KEY });

const aprovadas = brands.filter((b) => b.approved);
const pendentes = brands.filter((b) => !b.approved);

console.log(`Aprovadas (${aprovadas.length}):`);
for (const b of aprovadas) console.log(`  ✔ ${b.name}`);

console.log(`\nPendentes (${pendentes.length}):`);
for (const b of pendentes) {
  console.log(`  ✘ ${b.name}${b.exclusive ? ' [exclusiva]' : ''} — ${b.message ?? 'sem aprovação ainda'}`);
}
