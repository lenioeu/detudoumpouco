#!/usr/bin/env node
// Servidor local para testar um site já montado em dist/<id>.
// Uso: node scripts/servir.mjs quantocustava [porta]
// Imita o Cloudflare Pages: /sobre serve sobre.html e páginas inexistentes caem no 404.html.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const [id = 'quantocustava', porta = '8080'] = process.argv.slice(2);
const raiz = join(fileURLToPath(new URL('..', import.meta.url)), 'dist', id);
const tipos = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml',
};

async function existe(caminho) {
  try { return (await stat(caminho)).isFile(); } catch { return false; }
}

createServer(async (req, res) => {
  const caminho = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidatos = [join(raiz, caminho), join(raiz, `${caminho}.html`), join(raiz, caminho, 'index.html')];
  for (const arquivo of candidatos) {
    if (arquivo.startsWith(raiz) && await existe(arquivo)) {
      res.writeHead(200, { 'content-type': tipos[extname(arquivo)] ?? 'application/octet-stream' });
      res.end(await readFile(arquivo));
      return;
    }
  }
  res.writeHead(404, { 'content-type': tipos['.html'] });
  res.end(await readFile(join(raiz, '404.html')).catch(() => 'Não encontrado'));
}).listen(Number(porta), () => console.log(`Servindo dist/${id} em http://localhost:${porta}`));
