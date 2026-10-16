// Sorteios justos com crypto.getRandomValues (nunca Math.random).
// Para tirar um número entre 0 e n-1 sem viés de módulo, usamos "amostragem por rejeição":
// descartamos os valores de 32 bits da faixa final que não completa um ciclo inteiro de n.

/** Preenche o vetor com bytes aleatórios. Trocável nos testes. */
export type FonteAleatoria = (buf: Uint32Array) => Uint32Array;
const cripto: FonteAleatoria = (buf) => crypto.getRandomValues(buf);

const LIMITE = 2 ** 32;

/** Inteiro uniforme em [0, n), com 1 <= n <= 2^32. */
export function indiceAleatorio(n: number, fonte: FonteAleatoria = cripto): number {
  if (!Number.isInteger(n) || n < 1 || n > LIMITE) throw new RangeError('n fora do intervalo');
  if (n === 1) return 0;
  // Maior múltiplo de n que cabe em 32 bits: valores a partir dele são descartados.
  const teto = LIMITE - (LIMITE % n);
  const buf = new Uint32Array(1);
  for (;;) {
    const x = fonte(buf)[0];
    if (x < teto) return x % n;
  }
}

/** Inteiro uniforme entre `min` e `max`, incluindo os dois. */
export function inteiroEntre(min: number, max: number, fonte: FonteAleatoria = cripto): number {
  return min + indiceAleatorio(max - min + 1, fonte);
}

/** Embaralha uma cópia da lista (Fisher-Yates). */
export function embaralhar<T>(lista: readonly T[], fonte: FonteAleatoria = cripto): T[] {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = indiceAleatorio(i + 1, fonte);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Escolhe `k` itens diferentes da lista, na ordem em que foram sorteados. */
export function escolher<T>(lista: readonly T[], k: number, fonte: FonteAleatoria = cripto): T[] {
  const a = lista.slice();
  const n = Math.min(k, a.length);
  // Fisher-Yates parcial: só as primeiras n posições.
  for (let i = 0; i < n; i++) {
    const j = i + indiceAleatorio(a.length - i, fonte);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** Limites aceitos no sorteador de números (o intervalo cabe em 32 bits). */
export const NUM_MIN = -1_000_000_000;
export const NUM_MAX = 1_000_000_000;
export const QTD_MAX = 10_000;

export interface PedidoNumeros {
  min: number;
  max: number;
  quantidade: number;
  repetir: boolean;
  /** Números que não podem sair (já sorteados antes). */
  excluir?: ReadonlySet<number>;
}

export type ResultadoNumeros = { ok: true; numeros: number[] } | { ok: false; erro: string };

/** Valida o pedido e sorteia. Sem repetição, nenhum número sai duas vezes. */
export function sortearNumeros(p: PedidoNumeros, fonte: FonteAleatoria = cripto): ResultadoNumeros {
  const { min, max, quantidade, repetir } = p;
  const excluir = p.excluir ?? new Set<number>();
  if (![min, max, quantidade].every(Number.isInteger)) return { ok: false, erro: 'Use apenas números inteiros.' };
  if (min > max) return { ok: false, erro: 'O número inicial precisa ser menor ou igual ao final.' };
  if (min < NUM_MIN || max > NUM_MAX) return { ok: false, erro: 'Use números entre −1 bilhão e 1 bilhão.' };
  if (quantidade < 1) return { ok: false, erro: 'Sorteie pelo menos 1 número.' };
  if (quantidade > QTD_MAX) return { ok: false, erro: 'Sorteie no máximo 10.000 números de uma vez.' };

  const total = max - min + 1;
  let excluidosNoIntervalo = 0;
  for (const x of excluir) if (x >= min && x <= max) excluidosNoIntervalo++;
  const disponiveis = total - excluidosNoIntervalo;
  if (disponiveis <= 0) return { ok: false, erro: 'Todos os números do intervalo já foram sorteados. Clique em "Recomeçar".' };

  if (repetir) {
    if (excluidosNoIntervalo === 0) {
      return { ok: true, numeros: Array.from({ length: quantidade }, () => inteiroEntre(min, max, fonte)) };
    }
    const livres = listarLivres(min, max, excluir, disponiveis);
    if (livres) return { ok: true, numeros: Array.from({ length: quantidade }, () => livres[indiceAleatorio(livres.length, fonte)]) };
    return { ok: true, numeros: Array.from({ length: quantidade }, () => sortearForaDe(min, max, excluir, fonte)) };
  }

  if (quantidade > disponiveis) {
    const resto = excluidosNoIntervalo ? ` (restam ${disponiveis} que ainda não saíram)` : '';
    return { ok: false, erro: `Sem repetir, dá para sortear no máximo ${disponiveis} números nesse intervalo${resto}.` };
  }
  // Intervalo pequeno: embaralha a lista de candidatos. Intervalo grande: sorteia e descarta repetidos.
  const livres = listarLivres(min, max, excluir, disponiveis);
  if (livres) return { ok: true, numeros: escolher(livres, quantidade, fonte) };
  const saiu = new Set<number>();
  const numeros: number[] = [];
  while (numeros.length < quantidade) {
    const x = sortearForaDe(min, max, excluir, fonte);
    if (!saiu.has(x)) { saiu.add(x); numeros.push(x); }
  }
  return { ok: true, numeros };
}

function listarLivres(min: number, max: number, excluir: ReadonlySet<number>, disponiveis: number): number[] | null {
  if (max - min + 1 > 1_000_000) return null;
  const livres: number[] = new Array(disponiveis);
  let i = 0;
  for (let x = min; x <= max; x++) if (!excluir.has(x)) livres[i++] = x;
  return livres;
}

function sortearForaDe(min: number, max: number, excluir: ReadonlySet<number>, fonte: FonteAleatoria): number {
  // Só é usado com intervalo acima de 1 milhão e no máximo ~10 mil excluídos: quase nunca repete.
  for (;;) {
    const x = inteiroEntre(min, max, fonte);
    if (!excluir.has(x)) return x;
  }
}

/** Separa a lista colada (uma por linha, ou separada por vírgula/ponto e vírgula) em nomes. */
export function lerNomes(texto: string): string[] {
  const porLinha = texto.split(/\r?\n/);
  const partes = porLinha.length === 1 || porLinha.filter((l) => l.trim()).length === 1
    ? texto.split(/[;,\n]/)
    : porLinha;
  return partes.map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

/** Chave para comparar nomes: ignora maiúsculas e acentos. */
export const chaveNome = (n: string) => n.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');

/** Remove nomes repetidos (ignora maiúsculas e acentos), mantendo a primeira grafia. */
export function semDuplicados(nomes: readonly string[]): string[] {
  const visto = new Set<string>();
  return nomes.filter((n) => {
    const chave = chaveNome(n);
    if (visto.has(chave)) return false;
    visto.add(chave);
    return true;
  });
}

/**
 * Sorteia `k` nomes diferentes. Se um nome aparece várias vezes na lista, ele tem mais chances
 * (uma por linha), mas depois que sai, as outras linhas dele deixam de concorrer.
 */
export function sortearNomes(lista: readonly string[], k: number, fonte: FonteAleatoria = cripto): string[] {
  const unicos = semDuplicados(lista).length;
  if (unicos === lista.length) return escolher(lista, k, fonte);
  let resto = lista.slice();
  const saiu: string[] = [];
  while (saiu.length < Math.min(k, unicos)) {
    const nome = resto[indiceAleatorio(resto.length, fonte)];
    saiu.push(nome);
    const c = chaveNome(nome);
    resto = resto.filter((n) => chaveNome(n) !== c);
  }
  return saiu;
}
