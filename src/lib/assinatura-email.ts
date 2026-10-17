// Monta o HTML de uma assinatura de e-mail. Funções puras (nada de DOM).
//
// Regras do HTML de e-mail seguidas aqui:
// - só tabelas e estilos inline (os programas de e-mail apagam <style>, classes e scripts);
// - largura máxima de 600 px, `alt` em toda imagem e `width`/`height` explícitos;
// - links sempre com protocolo (https://, mailto: ou tel:);
// - tudo o que a pessoa digita passa por `escapar()`.
//
// Ícones das redes sociais: desenhos geométricos simples feitos para o Quebragalho
// (não são os logotipos oficiais). Ficam em public/email/icones/<rede>-<cor>.png,
// 48x48 px exibidos em 24x24 (@2x). Licença: CC0 1.0 (domínio público), obra própria do site;
// quem copiar a assinatura pode usar livremente.

import { linkWhatsapp } from './qr-conteudo';

export type Modelo = 'classico' | 'compacto' | 'faixa' | 'minimalista';
export type Fonte = 'arial' | 'georgia' | 'verdana' | 'trebuchet';
export type CorIcones = 'cinza' | 'destaque';
export type Rede = 'linkedin' | 'instagram' | 'facebook' | 'x' | 'youtube' | 'tiktok';

export interface Dados {
  nome: string; cargo: string; empresa: string;
  telefone: string; whatsapp: string; email: string; site: string; endereco: string;
  redes: Record<Rede, string>;
  frase: string;
  modelo: Modelo; cor: string; fonte: Fonte; icones: CorIcones;
}

/** Imagem já resolvida pela página (link colado ou arquivo convertido em data URI). */
export interface ImagemPronta { src: string; largura: number; altura: number; raio: string; }

export const REDES: { id: Rede; nome: string; base: string }[] = [
  { id: 'linkedin', nome: 'LinkedIn', base: 'https://www.linkedin.com/in/' },
  { id: 'instagram', nome: 'Instagram', base: 'https://www.instagram.com/' },
  { id: 'facebook', nome: 'Facebook', base: 'https://www.facebook.com/' },
  { id: 'x', nome: 'X (Twitter)', base: 'https://x.com/' },
  { id: 'youtube', nome: 'YouTube', base: 'https://www.youtube.com/@' },
  { id: 'tiktok', nome: 'TikTok', base: 'https://www.tiktok.com/@' },
];

/** Cores sugeridas. Cada uma tem os ícones das redes nesse tom (public/email/icones/*-<nome>.png). */
export const CORES: { nome: string; rotulo: string; hex: string }[] = [
  { nome: 'azul', rotulo: 'Azul', hex: '#1d5bd6' },
  { nome: 'verde', rotulo: 'Verde', hex: '#157a50' },
  { nome: 'vinho', rotulo: 'Vinho', hex: '#9f1239' },
  { nome: 'roxo', rotulo: 'Roxo', hex: '#6d28d9' },
  { nome: 'laranja', rotulo: 'Laranja', hex: '#c2410c' },
  { nome: 'grafite', rotulo: 'Grafite', hex: '#2d3340' },
];

export const FONTES: Record<Fonte, { rotulo: string; pilha: string }> = {
  arial: { rotulo: 'Arial', pilha: "Arial, Helvetica, sans-serif" },
  georgia: { rotulo: 'Georgia', pilha: "Georgia, 'Times New Roman', Times, serif" },
  verdana: { rotulo: 'Verdana', pilha: "Verdana, Geneva, sans-serif" },
  trebuchet: { rotulo: 'Trebuchet', pilha: "'Trebuchet MS', Helvetica, Arial, sans-serif" },
};

const TEXTO = '#1f2937';
const SUAVE = '#4b5563';
const CLARO = '#6b7280';

/** Troca os caracteres especiais do HTML. Serve para texto e para valores de atributo. */
export function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Cor no formato #rrggbb, ou a cor padrão se vier algo estranho. */
export function corValida(c: string): string {
  return /^#[0-9a-f]{6}$/i.test(c.trim()) ? c.trim().toLowerCase() : CORES[0].hex;
}

/**
 * Link seguro para usar em href/src: aceita http(s) e acrescenta https:// quando falta.
 * Recusa outros protocolos (javascript:, data: etc.) e textos que não parecem endereço.
 */
export function linkSeguro(entrada: string): string | null {
  let u = entrada.trim();
  if (!u || /\s/.test(u)) return null;
  if (u.startsWith('//')) u = 'https:' + u;
  else if (!/^https?:\/\//i.test(u)) {
    if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(u)) return null;
    u = 'https://' + u;
  }
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
  } catch { return null; }
  return u;
}

/** Endereço do perfil: aceita o link inteiro ou só o @usuario. */
export function linkRede(rede: Rede, valor: string): string | null {
  const v = valor.trim();
  if (!v) return null;
  const usuario = v.replace(/^@/, '');
  if (/^[\w.-]+$/.test(usuario) && (v.startsWith('@') || !usuario.includes('.'))) {
    return REDES.find((r) => r.id === rede)!.base + usuario;
  }
  return linkSeguro(v);
}

/** Link tel: com +55 quando a pessoa digitou DDD + número. */
export function linkTelefone(tel: string): string | null {
  const internacional = /^\s*(\+|00)/.test(tel);
  let d = tel.replace(/\D/g, '');
  if (d.length < 8 || d.length > 15) return null;
  if (internacional) return `tel:+${d.replace(/^00/, '')}`;
  if (d.length === 10 || d.length === 11) return `tel:+55${d}`;
  return `tel:${d}`;
}

export function emailValido(e: string): boolean {
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e.trim());
}

/** "https://www.site.com.br/" -> "www.site.com.br" */
export function siteParaMostrar(url: string): string {
  return url.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/** Nome da cor sugerida mais parecida (os ícones só existem nas cores sugeridas). */
export function corMaisProxima(hex: string): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(corValida(hex));
  let melhor = CORES[0], dist = Infinity;
  for (const c of CORES) {
    const [r2, g2, b2] = rgb(c.hex);
    const d = (r - r2) ** 2 * 0.3 + (g - g2) ** 2 * 0.59 + (b - b2) ** 2 * 0.11;
    if (d < dist) { dist = d; melhor = c; }
  }
  return melhor.nome;
}

/** Branco ou quase preto, o que tiver mais contraste com a cor de fundo. */
export function textoSobre(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(corValida(hex).slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05) / (l + 0.05) >= (l + 0.05) / 0.05 ? '#ffffff' : '#111827';
}

interface Contato { rotulo: string; texto: string; href: string | null; }

function contatos(d: Dados): Contato[] {
  const lista: Contato[] = [];
  const t = (s: string) => s.trim();
  if (t(d.telefone)) lista.push({ rotulo: 'Tel.', texto: t(d.telefone), href: linkTelefone(d.telefone) });
  if (t(d.whatsapp)) lista.push({ rotulo: 'WhatsApp', texto: t(d.whatsapp), href: linkWhatsapp(d.whatsapp) });
  if (t(d.email)) lista.push({ rotulo: 'E-mail', texto: t(d.email), href: emailValido(d.email) ? `mailto:${t(d.email)}` : null });
  if (t(d.site)) {
    const href = linkSeguro(d.site);
    lista.push({ rotulo: 'Site', texto: siteParaMostrar(d.site), href });
  }
  if (t(d.endereco)) lista.push({ rotulo: '', texto: t(d.endereco), href: null });
  return lista;
}

function redesPreenchidas(d: Dados) {
  return REDES.map((r) => ({ ...r, href: linkRede(r.id, d.redes[r.id] ?? '') })).filter((r) => r.href) as
    { id: Rede; nome: string; href: string }[];
}

function link(texto: string, href: string | null, estilo: string): string {
  return href ? `<a href="${escapar(href)}" target="_blank" style="${estilo}">${escapar(texto)}</a>` : `<span style="${estilo}">${escapar(texto)}</span>`;
}

function contatoHtml(c: Contato, cor: string): string {
  // O rótulo fica grudado no valor, e números de telefone não quebram no meio.
  const rot = c.rotulo ? `<span style="color:${cor};font-weight:bold;">${escapar(c.rotulo)}</span>&nbsp;&nbsp;` : '';
  const inteiro = c.rotulo === 'Tel.' || c.rotulo === 'WhatsApp' ? 'white-space:nowrap;' : '';
  return rot + link(c.texto, c.href, `color:${SUAVE};text-decoration:none;${inteiro}`);
}

function imagemHtml(img: ImagemPronta, nome: string, max = Infinity): string {
  const f = Math.min(1, max / img.largura);
  const w = Math.round(img.largura * f), h = Math.round(img.altura * f);
  const alt = nome.trim() ? `Foto de ${nome.trim()}` : 'Logo';
  return `<img src="${escapar(img.src)}" width="${w}" height="${h}" alt="${escapar(alt)}" style="display:block;width:${w}px;height:${h}px;border:0;border-radius:${escapar(img.raio)};" />`;
}

function iconesHtml(d: Dados, origem: string, tamanho = 24): string {
  const lista = redesPreenchidas(d);
  if (!lista.length) return '';
  const cor = d.icones === 'cinza' ? 'cinza' : corMaisProxima(d.cor);
  const celulas = lista.map((r) =>
    `<td style="padding:0 6px 0 0;"><a href="${escapar(r.href)}" target="_blank" style="text-decoration:none;"><img src="${escapar(origem)}/email/icones/${r.id}-${cor}.png" width="${tamanho}" height="${tamanho}" alt="${escapar(r.nome)}" style="display:block;width:${tamanho}px;height:${tamanho}px;border:0;" /></a></td>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>${celulas}</tr></table>`;
}

function cargoEmpresa(d: Dados): string {
  return [d.cargo.trim(), d.empresa.trim()].filter(Boolean).map(escapar).join(' &nbsp;|&nbsp; ');
}

function div(conteudo: string, estilo = ''): string {
  return conteudo ? `<div style="margin:0;${estilo}">${conteudo}</div>` : '';
}

/**
 * HTML da assinatura (um trecho, sem <html> nem <body>), pronto para colar no programa de e-mail.
 * `origem` é o endereço do site de onde vêm os ícones (ex.: https://oquebragalho.app).
 */
export function gerarAssinatura(d: Dados, img: ImagemPronta | null, origem: string): string {
  const cor = corValida(d.cor);
  const fonte = FONTES[d.fonte]?.pilha ?? FONTES.arial.pilha;
  const tabela = (extra = '') =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;max-width:600px;font-family:${fonte};font-size:14px;line-height:1.45;color:${TEXTO};${extra}">`;
  const nome = d.nome.trim() ? escapar(d.nome.trim()) : '';
  const cargo = cargoEmpresa(d);
  const cts = contatos(d);
  const frase = d.frase.trim() ? escapar(d.frase.trim()) : '';
  const fraseHtml = (estilo: string) => frase ? `<div style="margin:0;font-size:12px;line-height:1.4;color:${CLARO};${estilo}">${frase}</div>` : '';

  if (d.modelo === 'compacto') {
    const linha1 = [nome && `<span style="font-weight:bold;color:${cor};font-size:15px;">${nome}</span>`, cargo && `<span style="color:${SUAVE};">${cargo}</span>`].filter(Boolean).join(`<span style="color:${CLARO};"> &nbsp;|&nbsp; </span>`);
    const linha2 = cts.map((c) => contatoHtml(c, cor)).join(`<span style="color:${CLARO};"> &nbsp;·&nbsp; </span>`);
    const icones = iconesHtml(d, origem, 20);
    const texto = div(linha1) + div(linha2, 'font-size:13px;padding-top:2px;') + (icones ? div(icones, 'padding-top:6px;') : '') + fraseHtml('padding-top:6px;');
    const foto = img ? `<td valign="middle" style="padding:0 12px 0 0;vertical-align:middle;">${imagemHtml(img, d.nome, 64)}</td>` : '';
    return `${tabela()}<tr>${foto}<td valign="middle" style="vertical-align:middle;">${texto}</td></tr></table>`;
  }

  if (d.modelo === 'faixa') {
    const tf = textoSobre(cor);
    const cab = div(nome, `font-size:18px;font-weight:bold;color:${tf};`) + div(cargo, `font-size:13px;color:${tf};padding-top:2px;`);
    const lista = cts.map((c) => div(contatoHtml(c, cor), 'padding-bottom:2px;')).join('');
    const icones = iconesHtml(d, origem);
    const foto = img ? `<td valign="top" style="padding:14px 0 14px 16px;vertical-align:top;">${imagemHtml(img, d.nome)}</td>` : '';
    const rodape = icones || frase
      ? `<tr><td colspan="${img ? 2 : 1}" style="padding:0 16px 14px 16px;">${icones}${fraseHtml(icones ? 'padding-top:10px;' : '')}</td></tr>` : '';
    return `${tabela('border:1px solid #e5e7eb;')}`
      + `<tr><td colspan="${img ? 2 : 1}" bgcolor="${cor}" style="background-color:${cor};padding:12px 16px;">${cab || '&nbsp;'}</td></tr>`
      + `<tr>${foto}<td valign="top" style="padding:14px 16px;vertical-align:top;">${lista || '&nbsp;'}</td></tr>${rodape}</table>`;
  }

  if (d.modelo === 'minimalista') {
    const sep = `<span style="color:${CLARO};"> &nbsp;·&nbsp; </span>`;
    const redes = redesPreenchidas(d).map((r) => link(r.nome, r.href, `color:${cor};text-decoration:none;`)).join(sep);
    const corpo = div(nome, `font-weight:bold;font-size:15px;color:${TEXTO};`) + div(cargo, `color:${SUAVE};`)
      + div(cts.map((c) => contatoHtml(c, cor)).join(sep), 'font-size:13px;padding-top:6px;')
      + div(redes, 'font-size:13px;padding-top:4px;') + fraseHtml('padding-top:8px;');
    return `${tabela()}<tr><td style="border-top:2px solid ${cor};padding:10px 0 0 0;">${corpo || '&nbsp;'}</td></tr></table>`;
  }

  // Clássico: foto à esquerda, linha colorida e os dados à direita.
  const lista = cts.map((c) => div(contatoHtml(c, cor), 'padding-bottom:2px;')).join('');
  const icones = iconesHtml(d, origem);
  const texto = div(nome, `font-size:18px;font-weight:bold;color:${cor};`) + div(cargo, `color:${SUAVE};padding-bottom:8px;`)
    + lista + (icones ? div(icones, 'padding-top:8px;') : '');
  const foto = img ? `<td valign="top" style="padding:0 16px 0 0;vertical-align:top;">${imagemHtml(img, d.nome)}</td>` : '';
  const linhaFrase = frase ? `<tr><td colspan="${img ? 2 : 1}" style="padding:12px 0 0 0;">${fraseHtml('')}</td></tr>` : '';
  return `${tabela()}<tr>${foto}<td valign="top" style="border-left:3px solid ${cor};padding:0 0 0 16px;vertical-align:top;">${texto || '&nbsp;'}</td></tr>${linhaFrase}</table>`;
}

/** Arquivo .html completo, para baixar ou anexar no Thunderbird. */
export function documentoHtml(assinatura: string): string {
  return `<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<title>Assinatura de e-mail</title>\n</head>\n<body style="margin:0;padding:16px;background-color:#ffffff;">\n${assinatura}\n</body>\n</html>\n`;
}

/** Versão em texto puro, para quem cola em campo que não aceita formatação. */
export function textoSimples(d: Dados): string {
  const linhas = [d.nome.trim(), [d.cargo.trim(), d.empresa.trim()].filter(Boolean).join(' | ')];
  for (const c of contatos(d)) linhas.push(c.rotulo ? `${c.rotulo} ${c.texto}` : c.texto);
  for (const r of redesPreenchidas(d)) linhas.push(`${r.nome}: ${r.href}`);
  if (d.frase.trim()) linhas.push('', d.frase.trim());
  return linhas.filter((l, i) => l || (i > 0 && linhas[i - 1] !== '')).join('\n').trim();
}
