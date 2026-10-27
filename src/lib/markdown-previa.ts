// Mostra um Markdown como HTML para a prévia, de forma segura.
// Todo texto é escapado: nenhum HTML que venha do PDF (ou que a pessoa digite) é executado.
// Só saem as tags que este arquivo escreve, e links só para http(s) e mailto.
// Cobre o que a ferramenta "PDF para Markdown" gera: títulos, parágrafos, listas (com níveis),
// tabelas, linhas, citações, blocos de código, negrito, itálico, código e links. Função pura.

export function escaparHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function hrefSeguro(url: string): string | null {
  const u = url.trim();
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
  if (/^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/.test(u)) return 'mailto:' + u;
  return null;
}

function link(href: string, conteudo: string): string {
  return `<a href="${escaparHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">${conteudo}</a>`;
}

const PONTUACAO = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

/** Converte o texto de uma linha (negrito, itálico, código, links, escapes) em HTML. */
export function inlineParaHtml(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length && PONTUACAO.test(s[i + 1])) { out += escaparHtml(s[i + 1]); i += 2; continue; }
    if (c === '`') {
      const fim = s.indexOf('`', i + 1);
      if (fim > i) { out += `<code>${escaparHtml(s.slice(i + 1, fim))}</code>`; i = fim + 1; continue; }
    }
    if (c === '<') {
      const m = s.slice(i).match(/^<([^\s<>]+)>/);
      const href = m && hrefSeguro(m[1]);
      if (m && href) { out += link(href, escaparHtml(m[1].replace(/^mailto:/i, ''))); i += m[0].length; continue; }
    }
    if (c === '[') {
      const fimTexto = fechamento(s, i);
      if (fimTexto > 0 && s[fimTexto + 1] === '(') {
        const fimUrl = s.indexOf(')', fimTexto + 2);
        if (fimUrl > 0) {
          const url = s.slice(fimTexto + 2, fimUrl).trim().replace(/^<|>$/g, '');
          const href = hrefSeguro(url);
          const texto = inlineParaHtml(s.slice(i + 1, fimTexto));
          out += href ? link(href, texto) : texto;
          i = fimUrl + 1;
          continue;
        }
      }
    }
    if (c === '*' || c === '_') {
      let n = 1;
      while (s[i + n] === c) n++;
      const depois = s[i + n];
      const dentroDePalavra = c === '_' && /[\p{L}\p{N}]/u.test(s[i - 1] ?? '');
      if (n <= 3 && depois && !/\s/.test(depois) && !dentroDePalavra) {
        const fim = acharFechamento(s, i + n, c, n);
        if (fim > 0) {
          let dentro = inlineParaHtml(s.slice(i + n, fim));
          if (n === 1) dentro = `<em>${dentro}</em>`;
          else if (n === 2) dentro = `<strong>${dentro}</strong>`;
          else dentro = `<strong><em>${dentro}</em></strong>`;
          out += dentro;
          i = fim + n;
          continue;
        }
      }
      out += escaparHtml(c.repeat(n));
      i += n;
      continue;
    }
    out += escaparHtml(c);
    i++;
  }
  return out;
}

/** Posição do "]" que fecha o "[" em `ini`, considerando escapes e colchetes aninhados. */
function fechamento(s: string, ini: number): number {
  let prof = 0;
  for (let i = ini; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '[') prof++;
    else if (s[i] === ']' && --prof === 0) return i;
  }
  return -1;
}

/** Acha um grupo de exatamente `n` marcadores `c` que fecha a ênfase (sem espaço antes dele). */
function acharFechamento(s: string, ini: number, c: string, n: number): number {
  for (let i = ini; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '`') { const f = s.indexOf('`', i + 1); if (f > 0) { i = f; continue; } }
    if (s[i] !== c) continue;
    let k = 0;
    while (s[i + k] === c) k++;
    if (k === n && !/\s/.test(s[i - 1])) return i;
    i += k - 1;
  }
  return -1;
}

const RE_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const RE_SEPARADOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function celulas(linha: string): string[] {
  let t = linha.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const r: string[] = [];
  let atual = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && t[i + 1] === '|') { atual += '\\|'; i++; continue; }
    if (t[i] === '|') { r.push(atual.trim()); atual = ''; continue; }
    atual += t[i];
  }
  r.push(atual.trim());
  return r;
}

interface NoLista { ordenada: boolean; inicio: number; recuo: number; itens: { texto: string; filhos: NoLista[] }[]; }

function listaParaHtml(l: NoLista): string {
  const tag = l.ordenada ? 'ol' : 'ul';
  const inicio = l.ordenada && l.inicio !== 1 ? ` start="${l.inicio}"` : '';
  return `<${tag}${inicio}>` + l.itens.map((it) => `<li>${inlineParaHtml(it.texto)}${it.filhos.map(listaParaHtml).join('')}</li>`).join('') + `</${tag}>`;
}

/** Converte o Markdown inteiro em HTML seguro para a prévia. */
export function markdownParaHtml(md: string): string {
  const linhas = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i];
    const t = linha.trim();
    if (!t) { i++; continue; }

    if (/^(```|~~~)/.test(t)) {
      const cerca = t.slice(0, 3);
      const codigo: string[] = [];
      i++;
      while (i < linhas.length && !linhas[i].trim().startsWith(cerca)) codigo.push(linhas[i++]);
      i++;
      out.push(`<pre><code>${escaparHtml(codigo.join('\n'))}</code></pre>`);
      continue;
    }
    const comentario = t.match(/^<!--\s*([\s\S]*?)\s*-->$/);
    if (comentario) { out.push(`<p class="md-nota">${escaparHtml(comentario[1])}</p>`); i++; continue; }
    if (/^([-*_])(\s*\1){2,}$/.test(t)) { out.push('<hr>'); i++; continue; }
    const titulo = t.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?$/);
    if (titulo) { out.push(`<p class="md-h md-h${titulo[1].length}">${inlineParaHtml(titulo[2])}</p>`); i++; continue; }

    if (t.includes('|') && i + 1 < linhas.length && RE_SEPARADOR.test(linhas[i + 1]) && linhas[i + 1].includes('-')) {
      const cab = celulas(t);
      i += 2;
      const corpo: string[][] = [];
      while (i < linhas.length && linhas[i].trim() && linhas[i].includes('|')) corpo.push(celulas(linhas[i++]));
      const th = cab.map((c) => `<th>${inlineParaHtml(c)}</th>`).join('');
      const tr = corpo.map((r) => '<tr>' + cab.map((_, k) => `<td>${inlineParaHtml(r[k] ?? '')}</td>`).join('') + '</tr>').join('');
      out.push(`<div class="md-tabela"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`);
      continue;
    }

    if (RE_ITEM.test(linha)) {
      const raiz: NoLista[] = [];
      const pilha: NoLista[] = [];
      while (i < linhas.length) {
        const m = linhas[i].match(RE_ITEM);
        if (!m) {
          // Linha recuada sem marcador continua o item anterior.
          if (linhas[i].trim() && /^\s+/.test(linhas[i]) && pilha.length) {
            const l = pilha[pilha.length - 1];
            l.itens[l.itens.length - 1].texto += ' ' + linhas[i].trim();
            i++;
            continue;
          }
          break;
        }
        const recuo = m[1].replace(/\t/g, '    ').length;
        const ordenada = /\d/.test(m[2]);
        while (pilha.length && pilha[pilha.length - 1].recuo > recuo) pilha.pop();
        let topo = pilha[pilha.length - 1];
        if (topo && topo.recuo === recuo && topo.ordenada !== ordenada) { pilha.pop(); topo = pilha[pilha.length - 1]; }
        if (!topo || topo.recuo < recuo) {
          const nova: NoLista = { ordenada, inicio: ordenada ? parseInt(m[2], 10) : 1, recuo, itens: [] };
          if (topo && topo.itens.length) topo.itens[topo.itens.length - 1].filhos.push(nova);
          else raiz.push(nova);
          pilha.push(nova);
          topo = nova;
        }
        topo.itens.push({ texto: m[3], filhos: [] });
        i++;
      }
      out.push(raiz.map(listaParaHtml).join(''));
      continue;
    }

    if (t.startsWith('>')) {
      const citacao: string[] = [];
      while (i < linhas.length && linhas[i].trim().startsWith('>')) citacao.push(linhas[i++].trim().replace(/^>\s?/, ''));
      out.push(`<blockquote>${inlineParaHtml(citacao.join(' '))}</blockquote>`);
      continue;
    }

    const par: string[] = [];
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,6}\s|```|~~~|>)/.test(linhas[i].trim()) && !RE_ITEM.test(linhas[i])
      && !/^([-*_])(\s*\1){2,}$/.test(linhas[i].trim())) {
      par.push(linhas[i++].trim());
    }
    if (!par.length) { par.push(t); i++; }
    out.push(`<p>${inlineParaHtml(par.join(' '))}</p>`);
  }
  return out.join('\n');
}
