// Pix "copia e cola" (BR Code estático) no padrão EMV QRCPS-MPM, como define o
// Manual de Padrões para Iniciação do Pix do Banco Central. Funções puras.
//
// Estrutura (ID + tamanho com 2 dígitos + valor):
//   00 Payload Format Indicator = "01"
//   26 Merchant Account Information
//      00 GUI = "br.gov.bcb.pix"   01 chave   02 descrição (opcional)
//   52 Merchant Category Code = "0000"
//   53 Moeda = "986" (real)
//   54 Valor (opcional, "10.50")
//   58 País = "BR"
//   59 Nome do recebedor (até 25)
//   60 Cidade (até 15)
//   62 Dados adicionais: 05 txid ("***" quando não há)
//   63 CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF) de tudo, incluindo "6304"

export type TipoChave = 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria';

export const LIMITE_NOME = 25;
export const LIMITE_CIDADE = 15;
export const LIMITE_TXID = 25;

/** CRC16-CCITT-FALSE, em 4 dígitos hexadecimais maiúsculos. */
export function crc16(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Um campo EMV: ID + tamanho + valor. O tamanho máximo de um valor é 99. */
function campo(id: string, valor: string): string {
  const n = new TextEncoder().encode(valor).length;
  if (n > 99) throw new ErroPix(`Campo ${id} passou de 99 caracteres.`);
  return id + String(n).padStart(2, '0') + valor;
}

export class ErroPix extends Error {}

/** Tira acentos e caracteres fora do ASCII; alguns bancos recusam o código com acento. */
export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim();
}

// ---------- Validação das chaves (só confere, não gera documento) ----------

export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** CNPJ numérico ou alfanumérico (vigente desde julho de 2026): cada caractere vale código ASCII − 48. */
export function cnpjValido(cnpj: string): boolean {
  const c = cnpj.toUpperCase().replace(/[.\/\-\s]/g, '');
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < n; i++) s += (c.charCodeAt(i) - 48) * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

/** Converte o que a pessoa digitou para o formato da chave no DICT. Lança ErroPix com a explicação. */
export function normalizarChave(tipo: TipoChave, valor: string): string {
  const v = valor.trim();
  switch (tipo) {
    case 'cpf': {
      const d = v.replace(/\D/g, '');
      if (!cpfValido(d)) throw new ErroPix('CPF inválido. Confira os 11 números.');
      return d;
    }
    case 'cnpj': {
      const c = v.toUpperCase().replace(/[.\/\-\s]/g, '');
      if (!cnpjValido(c)) throw new ErroPix('CNPJ inválido. Confira os 14 caracteres.');
      return c;
    }
    case 'telefone': {
      let d = v.replace(/\D/g, '');
      if (v.startsWith('+') && !d.startsWith('55')) throw new ErroPix('A chave de celular precisa ser um número do Brasil (+55).');
      if (d.length === 11) d = '55' + d;
      if (!/^55[1-9]{2}9\d{8}$/.test(d)) throw new ErroPix('Celular inválido. Use DDD + número com 9 dígitos, como (11) 91234-5678.');
      return '+' + d;
    }
    case 'email': {
      const e = v.toLowerCase();
      if (e.length > 77 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(e)) {
        throw new ErroPix('E-mail inválido.');
      }
      return e;
    }
    case 'aleatoria': {
      const a = v.toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(a)) {
        throw new ErroPix('Chave aleatória inválida. Ela tem 32 letras e números separados por hífens, como 123e4567-e89b-12d3-a456-426614174000.');
      }
      return a;
    }
  }
}

export interface DadosPix {
  /** Chave já normalizada (use normalizarChave). */
  chave: string;
  nome: string;
  cidade: string;
  /** Em reais. 0 ou ausente: quem paga digita o valor. */
  valor?: number;
  /** Identificador da transação: até 25 letras e números. Vazio vira "***". */
  txid?: string;
  /** Mensagem para quem paga (nem todo banco mostra). */
  descricao?: string;
}

/** Monta o Pix copia e cola. Lança ErroPix se algum dado não couber no padrão. */
export function gerarPix({ chave, nome, cidade, valor, txid, descricao }: DadosPix): string {
  const n = semAcento(nome), c = semAcento(cidade), desc = semAcento(descricao ?? '');
  const id = (txid ?? '').trim();
  if (!chave) throw new ErroPix('Falta a chave Pix.');
  if (!n) throw new ErroPix('Falta o nome de quem recebe.');
  if (n.length > LIMITE_NOME) throw new ErroPix(`O nome pode ter até ${LIMITE_NOME} caracteres.`);
  if (!c) throw new ErroPix('Falta a cidade.');
  if (c.length > LIMITE_CIDADE) throw new ErroPix(`A cidade pode ter até ${LIMITE_CIDADE} caracteres.`);
  if (id && !/^[A-Za-z0-9]{1,25}$/.test(id)) throw new ErroPix('O identificador aceita só letras sem acento e números, até 25.');
  if (valor !== undefined && (!Number.isFinite(valor) || valor < 0)) throw new ErroPix('Valor inválido.');
  if (valor !== undefined && valor > 9_999_999_999.99) throw new ErroPix('Valor alto demais.');

  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', chave) + (desc ? campo('02', desc) : '');
  if (conta.length > 99) {
    const sobra = 99 - (conta.length - desc.length);
    throw new ErroPix(sobra > 0 ? `Com essa chave, a descrição pode ter até ${sobra} caracteres.` : 'Tire a descrição: não cabe junto com essa chave.');
  }
  // Arredonda para centavos sem o erro de ponto flutuante (1,005 vira 1,01).
  const centavos = valor ? Math.round(Number((valor * 100).toPrecision(15))) : 0;
  const valorStr = centavos ? (centavos / 100).toFixed(2) : '';
  const corpo = campo('00', '01')
    + campo('26', conta)
    + campo('52', '0000')
    + campo('53', '986')
    + (valorStr ? campo('54', valorStr) : '')
    + campo('58', 'BR')
    + campo('59', n)
    + campo('60', c)
    + campo('62', campo('05', id || '***'))
    + '6304';
  return corpo + crc16(corpo);
}

// ---------- Leitura, para conferir o código gerado ----------

export interface CampoLido { id: string; valor: string; filhos?: CampoLido[]; }

/** Separa um texto EMV em campos. Lança ErroPix se a estrutura estiver quebrada. */
export function lerCampos(texto: string): CampoLido[] {
  const lista: CampoLido[] = [];
  let i = 0;
  while (i < texto.length) {
    const id = texto.slice(i, i + 2), tam = Number(texto.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(texto.slice(i + 2, i + 4)) || i + 4 + tam > texto.length) throw new ErroPix('Estrutura do código inválida.');
    const valor = texto.slice(i + 4, i + 4 + tam);
    const c: CampoLido = { id, valor };
    if (id === '26' || id === '62') c.filhos = lerCampos(valor);
    lista.push(c);
    i += 4 + tam;
  }
  return lista;
}

export interface PixLido {
  crcOk: boolean;
  chave?: string; descricao?: string; nome?: string; cidade?: string;
  valor?: number; txid?: string; moeda?: string; pais?: string;
}

/** Lê um Pix copia e cola e confere o CRC. */
export function lerPix(codigo: string): PixLido {
  const t = codigo.trim();
  const crcOk = t.length > 8 && t.slice(-8, -4) === '6304' && crc16(t.slice(0, -4)) === t.slice(-4).toUpperCase();
  const campos = lerCampos(t);
  const get = (id: string, lista = campos) => lista.find((c) => c.id === id);
  const conta = get('26')?.filhos ?? [];
  const extra = get('62')?.filhos ?? [];
  const v = get('54')?.valor;
  return {
    crcOk,
    chave: get('00', conta)?.valor === 'br.gov.bcb.pix' ? get('01', conta)?.valor : undefined,
    descricao: get('02', conta)?.valor,
    nome: get('59')?.valor,
    cidade: get('60')?.valor,
    valor: v ? Number(v) : undefined,
    txid: get('05', extra)?.valor,
    moeda: get('53')?.valor,
    pais: get('58')?.valor,
  };
}
