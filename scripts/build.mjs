#!/usr/bin/env node
// Monta cada site em dist/<id>/ juntando a base (core/) com os arquivos do site.
//
// Uso:
//   node scripts/build.mjs                    todos os sites
//   node scripts/build.mjs quantocustava      só um site
//   node scripts/build.mjs --producao         falha se faltar dado obrigatório
//
// Modelos HTML: um bloco opcional de "front matter" (--- chave: valor ---) no topo,
// {{> parcial}} para incluir core/parciais/<parcial>.html e {{variavel}} para valores.

import { cp, mkdir, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hojeEmBrasilia, somarDias } from '#core/dia.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PRODUCAO = args.includes('--producao');
const pedidos = args.filter((a) => !a.startsWith('--'));

// Valores que entram no HTML sem escapar (são gerados pelo próprio build).
const SEM_ESCAPAR = new Set(['selo', 'familiaLinks', 'configJson', 'conteudo', 'cabecaExtra']);

const escapar = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function separarFrontMatter(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { meta: {}, corpo: texto };
  const meta = {};
  for (const linha of m[1].split('\n')) {
    const i = linha.indexOf(':');
    if (i > 0) meta[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  return { meta, corpo: texto.slice(m[0].length) };
}

async function carregarParciais() {
  const pasta = join(RAIZ, 'core', 'parciais');
  const parciais = {};
  for (const arquivo of await readdir(pasta)) {
    parciais[arquivo.replace(/\.html$/, '')] = await readFile(join(pasta, arquivo), 'utf8');
  }
  return parciais;
}

function criarRenderizador(parciais) {
  const substituir = (texto, vars, profundidade = 0) => {
    if (profundidade > 5) throw new Error('Parciais aninhadas demais');
    return texto
      .replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, nome) => {
        if (!(nome in parciais)) throw new Error(`Parcial inexistente: ${nome}`);
        return substituir(parciais[nome], vars, profundidade + 1);
      })
      .replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, nome) => {
        if (!(nome in vars)) throw new Error(`Variável sem valor: {{${nome}}}`);
        return SEM_ESCAPAR.has(nome) ? String(vars[nome]) : escapar(vars[nome]);
      });
  };
  return substituir;
}

async function lerSvg(caminho) {
  return (await readFile(caminho, 'utf8')).replace(/<\?xml[^>]*>\s*/, '').replace(/<!--[\s\S]*?-->\s*/g, '').trim();
}

async function construirSite(id, parciais, familia) {
  const pastaSite = join(RAIZ, 'sites', id);
  const site = JSON.parse(await readFile(join(pastaSite, 'site.json'), 'utf8'));
  const saida = join(RAIZ, 'dist', id);
  const avisos = [];

  for (const campo of ['contato', 'responsavel']) {
    if (!site[campo]) {
      avisos.push(`"${campo}" está vazio em sites/${id}/site.json`);
      site[campo] = `[defina "${campo}" em site.json]`;
    }
  }
  if (!site.anuncios?.cliente) avisos.push('anúncios desligados: falta "anuncios.cliente" (ca-pub-...)');
  if (PRODUCAO && avisos.some((a) => !a.startsWith('anúncios'))) {
    throw new Error(`${id}: ${avisos.join('; ')}`);
  }

  await rm(saida, { recursive: true, force: true });
  await mkdir(saida, { recursive: true });
  await cp(join(RAIZ, 'core', 'css'), join(saida, 'core', 'css'), { recursive: true });
  await cp(join(RAIZ, 'core', 'js'), join(saida, 'core', 'js'), { recursive: true });
  for (const pasta of ['css', 'js', 'publico']) {
    const origem = join(pastaSite, pasta);
    if (existsSync(origem)) await cp(origem, pasta === 'publico' ? saida : join(saida, pasta), { recursive: true });
  }

  const pastaMarca = join(RAIZ, 'marca', site.marca ?? id);
  const icone = join(pastaMarca, 'icone.svg');
  const favicon = existsSync(join(pastaMarca, 'favicon.svg')) ? join(pastaMarca, 'favicon.svg') : icone;
  await cp(favicon, join(saida, 'favicon.svg'));

  const versao = Date.now().toString(36);
  const hoje = hojeEmBrasilia();
  const config = { id, nome: site.nome, dominio: site.dominio, lancamento: site.lancamento, versao, anuncios: site.anuncios ?? {} };
  const base = {
    ...site,
    versao,
    hoje,
    selo: (await lerSvg(icone)).replace('<svg', '<svg width="36" height="36" aria-hidden="true" focusable="false"'),
    configJson: JSON.stringify(config).replace(/</g, '\\u003c'),
    familiaLinks: familia
      .filter((f) => f.id !== id)
      .map((f) => `<li><a href="https://${f.dominio}"><span style="background:${f.cor}"></span>${escapar(f.nome)}</a></li>`)
      .join(''),
    dataAtualizacao: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${hoje}T12:00:00Z`)),
    cabecaExtra: '',
  };
  const substituir = criarRenderizador(parciais);
  const paginas = [];

  /** Renderiza um modelo e grava em dist. `caminho` é a URL pública ("/", "/sobre"). */
  async function publicar(modelo, caminho, vars = {}) {
    const { meta, corpo } = separarFrontMatter(modelo);
    const todas = { ...base, ...meta, ...vars, caminho };
    for (const [k, v] of Object.entries(meta)) todas[k] = substituir(v, todas);
    todas.tituloCompleto = todas.titulo ? `${todas.titulo} · ${site.nome}` : `${site.nome} · ${site.descricao.split(':')[0]}`;
    const html = substituir(corpo, todas);
    const arquivo = caminho === '/' ? 'index.html' : `${caminho.slice(1)}.html`;
    await mkdir(dirname(join(saida, arquivo)), { recursive: true });
    await writeFile(join(saida, arquivo), html);
    if (caminho !== '/404' && !todas.semIndice) paginas.push(caminho);
  }

  // Páginas comuns (core) e do site; as do site substituem as comuns de mesmo nome.
  const modelos = new Map();
  for (const pasta of [join(RAIZ, 'core', 'paginas'), join(pastaSite, 'paginas')]) {
    if (!existsSync(pasta)) continue;
    for (const arquivo of await readdir(pasta)) modelos.set(arquivo, join(pasta, arquivo));
  }
  for (const [arquivo, caminhoModelo] of modelos) {
    const nome = arquivo.replace(/\.html$/, '');
    await publicar(await readFile(caminhoModelo, 'utf8'), nome === 'index' ? '/' : `/${nome}`);
  }

  // Etapa própria do site (dados, páginas de respostas etc.).
  const etapa = join(pastaSite, 'build.mjs');
  if (existsSync(etapa)) {
    const { default: construir } = await import(pathToFileURL(etapa));
    await construir({
      site, saida, hoje, publicar, escapar,
      modeloTexto: await readFile(join(RAIZ, 'core', 'modelos', 'texto.html'), 'utf8'),
      amanha: somarDias(hoje, 1),
    });
  }

  const pub = site.anuncios?.cliente?.replace(/^ca-/, '');
  await writeFile(join(saida, 'ads.txt'), pub
    ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`
    : '# Preencha anuncios.cliente em site.json para gerar esta linha.\n');
  await writeFile(join(saida, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: https://${site.dominio}/sitemap.xml\n`);
  await writeFile(join(saida, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paginas.map((p) => `  <url><loc>https://${site.dominio}${p === '/' ? '/' : p}</loc></url>`).join('\n')}
</urlset>
`);
  await writeFile(join(saida, '_headers'), `/dados/*\n  Cache-Control: public, max-age=300\n/core/*\n  Cache-Control: public, max-age=3600\n`);

  console.log(`✔ ${id}: ${paginas.length} páginas em dist/${id}`);
  for (const aviso of avisos) console.log(`  aviso: ${aviso}`);
}

async function main() {
  const parciais = await carregarParciais();
  const familia = JSON.parse(await readFile(join(RAIZ, 'core', 'familia.json'), 'utf8'));
  const disponiveis = [];
  for (const id of await readdir(join(RAIZ, 'sites'))) {
    if ((await stat(join(RAIZ, 'sites', id))).isDirectory() && existsSync(join(RAIZ, 'sites', id, 'site.json'))) disponiveis.push(id);
  }
  const alvos = pedidos.length ? pedidos : disponiveis;
  for (const id of alvos) {
    if (!disponiveis.includes(id)) throw new Error(`Site desconhecido: ${id}`);
    await construirSite(id, parciais, familia);
  }
}

main().catch((erro) => {
  console.error(`✘ ${erro.message}`);
  process.exit(1);
});
