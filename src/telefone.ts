/**
 * Normaliza um telefone brasileiro para o formato usado pela API do WhatsApp:
 * só dígitos, com DDI 55. Retorna null quando não parece um telefone válido.
 *
 * Aceita "(51) 99999-8888", "+55 51 99999-8888", "5551999998888" etc.
 */
export function normalizarTelefone(entrada: string): string | null {
  let digitos = entrada.replace(/\D/g, "");
  if (digitos.startsWith("00")) digitos = digitos.slice(2);
  if (digitos.startsWith("0")) digitos = digitos.slice(1); // 0 de operadora/DDD

  // DDD + número (10 ou 11 dígitos) sem DDI
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;

  if (digitos.startsWith("55")) {
    return digitos.length === 12 || digitos.length === 13 ? digitos : null;
  }
  // Números estrangeiros: aceita se tiver um tamanho plausível (E.164 vai até 15 dígitos)
  return digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
}

/** "5551999998888" -> "+55 (51) 99999-8888" */
export function formatarTelefone(telefone: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(telefone);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${telefone}`;
}
