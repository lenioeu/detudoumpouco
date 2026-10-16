// Explica o conteúdo lido de um QR Code: link, Pix, Wi-Fi, WhatsApp, e-mail, telefone...
// Funções puras, usadas pelo Leitor de QR Code.
import { lerPix } from './pix';
import { formatar } from './numeros';

export type TipoLido = 'link' | 'whatsapp' | 'pix' | 'wifi' | 'email' | 'telefone' | 'sms' | 'contato' | 'local' | 'texto';

export interface Leitura {
  tipo: TipoLido;
  /** Nome curto do tipo, ex.: "Rede Wi-Fi". */
  titulo: string;
  /** Uma ou duas frases explicando o que acontece ao usar este QR Code. */
  explicacao: string;
  /** Pares rótulo e valor para mostrar ao usuário. */
  detalhes: [string, string][];
  /** Aviso de segurança, quando houver. */
  aviso?: string;
  /** Endereço http(s) que pode virar um botão "Abrir". Nunca javascript: ou data:. */
  abrir?: string;
}

const AVISO_LINK =
  'Confira o endereço antes de abrir. Golpistas colam QR Codes falsos por cima dos verdadeiros e criam sites parecidos com os de bancos e lojas. Nunca digite senha nem dados do cartão num site que você abriu por QR Code sem ter certeza de quem é.';

const ENCURTADORES = /^(bit\.ly|tinyurl\.com|t\.co|cutt\.ly|is\.gd|ow\.ly|rebrand\.ly|shorturl\.at|encurtador\.com\.br|tiny\.cc|rb\.gy|s\.id|abre\.ai|qrco\.de|goo\.gl)$/i;

/** Formata 5511912345678 como +55 (11) 91234-5678. Outros países ficam só com o +. */
export function formatarTelefone(digitos: string): string {
  const d = digitos.replace(/\D/g, '');
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  if (br) return `+55 (${br[1]}) ${br[2]}-${br[3]}`;
  return d ? `+${d}` : '';
}

/** Separa o texto WIFI:T:WPA;S:rede;P:senha;; respeitando as barras invertidas. */
export function lerWifi(texto: string): { rede: string; senha: string; seguranca: string; oculta: boolean } | null {
  if (!/^WIFI:/i.test(texto)) return null;
  const campos: Record<string, string> = {};
  let i = 5, chave = '', valor = '', lendoValor = false;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '\\' && i + 1 < texto.length) { if (lendoValor) valor += texto[i + 1]; else chave += texto[i + 1]; i += 2; continue; }
    if (!lendoValor && c === ':') { lendoValor = true; i++; continue; }
    if (c === ';') { if (chave) campos[chave.toUpperCase()] = valor; chave = ''; valor = ''; lendoValor = false; i++; continue; }
    if (lendoValor) valor += c; else chave += c;
    i++;
  }
  if (chave) campos[chave.toUpperCase()] = valor;
  if (!('S' in campos)) return null;
  return { rede: campos.S, senha: campos.P ?? '', seguranca: campos.T || 'nopass', oculta: /^true$/i.test(campos.H ?? '') };
}

function lerWhatsapp(url: URL): { telefone: string; mensagem: string } | null {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'wa.me') {
    const tel = url.pathname.replace(/\D/g, '');
    return { telefone: tel, mensagem: url.searchParams.get('text') ?? '' };
  }
  if (host === 'api.whatsapp.com' || host === 'whatsapp.com' || host === 'web.whatsapp.com') {
    if (!/^\/send/.test(url.pathname)) return null;
    return { telefone: (url.searchParams.get('phone') ?? '').replace(/\D/g, ''), mensagem: url.searchParams.get('text') ?? '' };
  }
  return null;
}

function lerLink(texto: string): Leitura {
  const url = new URL(texto);
  const zap = lerWhatsapp(url);
  if (zap) {
    const detalhes: [string, string][] = [];
    if (zap.telefone) detalhes.push(['Número', formatarTelefone(zap.telefone)]);
    if (zap.mensagem) detalhes.push(['Mensagem pronta', zap.mensagem]);
    detalhes.push(['Endereço completo', texto]);
    return {
      tipo: 'whatsapp', titulo: 'Conversa no WhatsApp', detalhes, abrir: texto,
      explicacao: zap.telefone
        ? 'Ao abrir, o WhatsApp inicia uma conversa com este número' + (zap.mensagem ? ', com a mensagem já escrita. Nada é enviado até você tocar em enviar.' : '. Nada é enviado até você escrever e tocar em enviar.')
        : 'Ao abrir, o WhatsApp pede para você escolher para quem mandar a mensagem.',
      aviso: 'Confira se o número é mesmo de quem você espera. Golpistas usam QR Codes de WhatsApp para se passar por lojas e pedir pagamento.',
    };
  }
  const host = url.hostname.toLowerCase();
  const detalhes: [string, string][] = [['Site', host], ['Endereço completo', texto]];
  let aviso = AVISO_LINK;
  if (ENCURTADORES.test(host.replace(/^www\./, ''))) aviso = 'Este é um link encurtado: não dá para saber o site final antes de abrir. ' + aviso;
  if (host.split('.').some((p) => p.startsWith('xn--'))) aviso = 'O nome deste site usa letras especiais que podem imitar outro endereço. ' + aviso;
  if (url.protocol === 'http:') detalhes.push(['Conexão', 'Sem cadeado (http). Não digite dados pessoais nesse site.']);
  return {
    tipo: 'link', titulo: 'Link para um site', detalhes, aviso, abrir: texto,
    explicacao: 'Este QR Code leva para um endereço na internet. Ele só é aberto se você tocar em "Abrir link".',
  };
}

function lerPixLido(texto: string): Leitura {
  const p = lerPix(texto);
  const detalhes: [string, string][] = [];
  if (p.chave) detalhes.push(['Chave Pix', p.chave]);
  if (p.nome) detalhes.push(['Recebedor', p.nome]);
  if (p.cidade) detalhes.push(['Cidade', p.cidade]);
  detalhes.push(['Valor', p.valor ? `R$ ${formatar(p.valor)}` : 'Quem paga digita']);
  if (p.descricao) detalhes.push(['Mensagem', p.descricao]);
  if (p.txid && p.txid !== '***') detalhes.push(['Identificador', p.txid]);
  detalhes.push(['Código de verificação', p.crcOk ? 'Correto' : 'Com erro: o banco deve recusar este código']);
  return {
    tipo: 'pix', titulo: 'Pagamento Pix',
    explicacao: p.chave
      ? 'É um QR Code Pix estático. Para pagar, abra o aplicativo do seu banco, escolha "Pix copia e cola" e cole o conteúdo copiado, ou leia o QR Code pela câmera do próprio aplicativo.'
      : 'É um QR Code Pix dinâmico, gerado por um banco ou loja. Para ver valor e recebedor, leia pelo aplicativo do seu banco ou use "Pix copia e cola" com o conteúdo copiado.',
    detalhes,
    aviso: 'Antes de confirmar o pagamento, confira no aplicativo do banco o nome de quem vai receber. Ler o QR Code aqui não paga nada.',
  };
}

function lerVcard(texto: string): Leitura {
  const linha = (campo: string) => {
    const m = new RegExp(`^${campo}(?:;[^:\\r\\n]*)?:(.*)$`, 'im').exec(texto);
    return m ? m[1].trim().replace(/\\([,;\\])/g, '$1') : '';
  };
  const nome = linha('FN') || linha('N').split(';').filter(Boolean).reverse().join(' ');
  const detalhes: [string, string][] = [];
  if (nome) detalhes.push(['Nome', nome]);
  const org = linha('ORG'); if (org) detalhes.push(['Empresa', org.replace(/;/g, ' ')]);
  const tel = linha('TEL'); if (tel) detalhes.push(['Telefone', tel]);
  const email = linha('EMAIL'); if (email) detalhes.push(['E-mail', email]);
  const url = linha('URL'); if (url) detalhes.push(['Site', url]);
  return { tipo: 'contato', titulo: 'Cartão de contato', detalhes, explicacao: 'É um cartão de visita digital (vCard). Pela câmera do celular, ele oferece salvar o contato na agenda.' };
}

/** Descobre o que é o texto lido de um QR Code e prepara a explicação. */
export function interpretar(bruto: string): Leitura {
  const texto = bruto.trim();
  if (/^000201/.test(texto) && /br\.gov\.bcb\.pix/i.test(texto)) {
    try { return lerPixLido(texto); } catch { /* estrutura quebrada: mostra como texto */ }
  }
  const wifi = lerWifi(texto);
  if (wifi) {
    const seg = /^nopass$/i.test(wifi.seguranca) ? 'Sem senha' : wifi.seguranca.toUpperCase() === 'WEP' ? 'WEP' : 'WPA/WPA2/WPA3';
    const detalhes: [string, string][] = [['Rede', wifi.rede]];
    if (wifi.senha) detalhes.push(['Senha', wifi.senha]);
    detalhes.push(['Segurança', seg]);
    if (wifi.oculta) detalhes.push(['Rede oculta', 'Sim']);
    return { tipo: 'wifi', titulo: 'Rede Wi-Fi', detalhes, explicacao: 'Este QR Code guarda o nome e a senha de uma rede Wi-Fi. Pela câmera do Android ou do iPhone, o celular conecta sozinho. No computador, use a senha mostrada aqui.' };
  }
  if (/^https?:\/\//i.test(texto)) {
    try { return lerLink(texto); } catch { /* URL inválida: cai para texto */ }
  }
  const mailto = /^mailto:([^?]*)(\?.*)?$/i.exec(texto);
  if (mailto) {
    const q = new URLSearchParams(mailto[2]?.slice(1) ?? '');
    const detalhes: [string, string][] = [['Para', decodeURIComponent(mailto[1])]];
    if (q.get('subject')) detalhes.push(['Assunto', q.get('subject')!]);
    if (q.get('body')) detalhes.push(['Mensagem', q.get('body')!]);
    return { tipo: 'email', titulo: 'E-mail', detalhes, explicacao: 'Abre o aplicativo de e-mail com o destinatário já preenchido. Nada é enviado sem você confirmar.' };
  }
  const matmsg = /^MATMSG:/i.test(texto) ? texto : '';
  if (matmsg) {
    const pega = (k: string) => new RegExp(`${k}:([^;]*);`, 'i').exec(matmsg)?.[1] ?? '';
    const detalhes: [string, string][] = [['Para', pega('TO')]];
    if (pega('SUB')) detalhes.push(['Assunto', pega('SUB')]);
    if (pega('BODY')) detalhes.push(['Mensagem', pega('BODY')]);
    return { tipo: 'email', titulo: 'E-mail', detalhes, explicacao: 'Abre o aplicativo de e-mail com o destinatário já preenchido. Nada é enviado sem você confirmar.' };
  }
  const tel = /^tel:(.+)$/i.exec(texto);
  if (tel) return { tipo: 'telefone', titulo: 'Telefone', detalhes: [['Número', tel[1].trim()]], explicacao: 'Abre o discador do celular com este número. A ligação só acontece se você tocar para ligar.' };
  const sms = /^(?:smsto|sms):([^:?]*)[:?]?(?:body=)?(.*)$/i.exec(texto);
  if (sms) {
    const detalhes: [string, string][] = [['Número', sms[1].trim()]];
    if (sms[2]) detalhes.push(['Mensagem', sms[2]]);
    return { tipo: 'sms', titulo: 'Mensagem SMS', detalhes, explicacao: 'Abre o aplicativo de mensagens com o número e o texto prontos. Confira antes de enviar: SMS para números curtos pode ser cobrado.' };
  }
  if (/^BEGIN:VCARD/i.test(texto) || /^MECARD:/i.test(texto)) {
    if (/^MECARD:/i.test(texto)) {
      const pega = (k: string) => new RegExp(`[:;]${k}:([^;]*)`, 'i').exec(texto)?.[1] ?? '';
      const detalhes: [string, string][] = [];
      if (pega('N')) detalhes.push(['Nome', pega('N').split(',').reverse().join(' ').trim()]);
      if (pega('TEL')) detalhes.push(['Telefone', pega('TEL')]);
      if (pega('EMAIL')) detalhes.push(['E-mail', pega('EMAIL')]);
      return { tipo: 'contato', titulo: 'Cartão de contato', detalhes, explicacao: 'É um cartão de contato. Pela câmera do celular, ele oferece salvar o contato na agenda.' };
    }
    return lerVcard(texto);
  }
  const geo = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(texto);
  if (geo) {
    return {
      tipo: 'local', titulo: 'Localização', detalhes: [['Latitude', geo[1]], ['Longitude', geo[2]]],
      explicacao: 'É um ponto no mapa. Pelo celular, abre o aplicativo de mapas nesse lugar.',
      abrir: `https://www.google.com/maps?q=${geo[1]},${geo[2]}`,
    };
  }
  return { tipo: 'texto', titulo: 'Texto', detalhes: [], explicacao: 'Este QR Code guarda só um texto, sem link. Você pode copiar e colar onde quiser.' };
}
