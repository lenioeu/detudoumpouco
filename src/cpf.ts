/** Devolve só os 11 dígitos se o CPF for válido (dígitos verificadores conferem), senão null. */
export function validarCpf(entrada: string): string | null {
  const cpf = entrada.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return null;

  const digito = (base: string) => {
    const soma = [...base].reduce((acc, d, i) => acc + Number(d) * (base.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(cpf.slice(0, 9));
  const d2 = digito(cpf.slice(0, 9) + d1);
  return cpf.endsWith(`${d1}${d2}`) ? cpf : null;
}

/** "12345678909" -> "***.456.789-**" (formato de exibição parcial usado em registros públicos). */
export function mascararCpf(cpf: string): string {
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

/** "52998224725" -> "529.982.247-25" */
export function formatarCpf(cpf: string): string {
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}
