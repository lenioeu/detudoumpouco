/**
 * Código curto de cada documento, usado no link de verificação (deacordo.app/v/K7P2QXM).
 * Só maiúsculas e algarismos sem os que se confundem (0/O, 1/I): fácil de ditar e cabe num QR Code
 * pequeno, porque um link todo em maiúsculas usa o modo alfanumérico, mais compacto.
 */
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 32 símbolos: cada byte aleatório vira um sem viés
const TAMANHO = 7;

export const FORMATO_CODIGO_CURTO = /^[2-9A-HJ-NP-Z]{7}$/;

export function gerarCodigoCurto(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TAMANHO));
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}
