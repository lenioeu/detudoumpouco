/** "1,4 MB", "820 KB" */
export function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/** Troca a extensão: "foto.png" + "jpg" -> "foto.jpg" */
export function trocarExtensao(nome: string, ext: string): string {
  return nome.replace(/\.[^.]+$/, '') + '.' + ext;
}
