import { readFile, writeFile } from 'fs/promises';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const out = `// Gerado automaticamente por scripts/build-worker.mjs — não editar à mão.\nexport const SITE_HTML = ${JSON.stringify(html)};\n`;

await writeFile(new URL('../worker/site.generated.js', import.meta.url), out);
console.log('worker/site.generated.js atualizado a partir de dist/index.html');
