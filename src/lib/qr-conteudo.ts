// Monta o texto que vai dentro de um QR Code (link, Wi-Fi, WhatsApp). Funções puras.

/** Acrescenta https:// quando a pessoa digita só "site.com.br". */
export function normalizarLink(url: string): string {
  const u = url.trim();
  if (!u) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
  return `https://${u}`;
}

export type SegurancaWifi = 'WPA' | 'WEP' | 'nopass';
export interface Wifi { rede: string; senha: string; seguranca: SegurancaWifi; oculta?: boolean; }

/** No formato de Wi-Fi, \ ; , : e " precisam de barra invertida antes. */
const escaparWifi = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');

/** Texto padrão lido pelas câmeras do Android e do iPhone: WIFI:T:WPA;S:rede;P:senha;; */
export function textoWifi({ rede, senha, seguranca, oculta }: Wifi): string {
  let s = `WIFI:T:${seguranca};S:${escaparWifi(rede)};`;
  if (seguranca !== 'nopass') s += `P:${escaparWifi(senha)};`;
  if (oculta) s += 'H:true;';
  return s + ';';
}

/**
 * Só os dígitos do telefone, com 55 na frente quando a pessoa digitou DDD + número
 * (10 ou 11 dígitos). Quem começa com + ou 00 já digitou o código do país
 * (ex.: +1 415 555 0100 tem 11 dígitos e não é do Brasil). Devolve null se não parecer um telefone.
 */
export function telefoneWhatsapp(tel: string): string | null {
  const internacional = /^\s*(\+|00)/.test(tel);
  let d = tel.replace(/\D/g, '');
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (!internacional && (d.length === 10 || d.length === 11)) d = '55' + d;
  // Com código do país explícito aceita números curtos (EUA: 11 dígitos); sem ele, exige 55 + DDD + número.
  return d.length >= (internacional ? 8 : 12) && d.length <= 15 ? d : null;
}

/** Link wa.me que abre a conversa, com a mensagem já escrita se houver. */
export function linkWhatsapp(tel: string, mensagem = ''): string | null {
  const d = telefoneWhatsapp(tel);
  if (!d) return null;
  const m = mensagem.trim();
  return `https://wa.me/${d}${m ? `?text=${encodeURIComponent(m)}` : ''}`;
}
