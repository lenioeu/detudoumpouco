// Diferença entre duas listas (algoritmo de Myers, o mesmo princípio do "git diff").
// Função pura: serve para palavras, linhas ou qualquer outra coisa comparável.

export type TipoTrecho = 'igual' | 'removido' | 'adicionado';

/** Um pedaço do resultado. `a` e `b` são intervalos [início, fim) nas listas A e B. */
export interface Trecho {
  tipo: TipoTrecho;
  a: [number, number];
  b: [number, number];
}

/**
 * Compara A (original) com B (novo) e devolve os trechos em ordem: iguais, removidos de A e adicionados em B.
 * `limite` é o número máximo de mudanças (palavras removidas + adicionadas) que vale a pena procurar:
 * acima disso a conta fica lenta e pesada, e a função devolve `null`.
 */
export function diferencas<T>(
  a: readonly T[],
  b: readonly T[],
  igual: (x: T, y: T) => boolean = (x, y) => x === y,
  limite = 4000,
): Trecho[] | null {
  const n = a.length, m = b.length;
  // Começo e fim iguais saem da conta (quase sempre é a maior parte do texto).
  let ini = 0;
  while (ini < n && ini < m && igual(a[ini], b[ini])) ini++;
  let fim = 0;
  while (fim < n - ini && fim < m - ini && igual(a[n - 1 - fim], b[m - 1 - fim])) fim++;

  const N = n - ini - fim, M = m - ini - fim;
  const meio = caminho(N, M, (x, y) => igual(a[ini + x], b[ini + y]), limite);
  if (!meio) return null;

  const trechos: Trecho[] = [];
  const juntar = (tipo: TipoTrecho, ia: number, ib: number) => {
    const ult = trechos[trechos.length - 1];
    const da = tipo === 'adicionado' ? 0 : 1;
    const db = tipo === 'removido' ? 0 : 1;
    if (ult && ult.tipo === tipo && ult.a[1] === ia && ult.b[1] === ib) { ult.a[1] += da; ult.b[1] += db; }
    else trechos.push({ tipo, a: [ia, ia + da], b: [ib, ib + db] });
  };
  for (let i = 0; i < ini; i++) juntar('igual', i, i);
  for (const [tipo, x, y] of meio) juntar(tipo, ini + x, ini + y);
  for (let i = 0; i < fim; i++) juntar('igual', n - fim + i, m - fim + i);
  return trechos;
}

/**
 * Myers O(ND): menor sequência de passos de (0,0) até (N,M).
 * Cada passo é [tipo, posição em A, posição em B] na ordem do texto.
 */
function caminho(N: number, M: number, igual: (x: number, y: number) => boolean, limite: number): [TipoTrecho, number, number][] | null {
  const passos: [TipoTrecho, number, number][] = [];
  if (N === 0 && M === 0) return passos;
  const max = Math.min(N + M, limite);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  // Cópia de v (só as diagonais -d..d) depois de cada rodada d, para refazer o caminho de trás para frente.
  const rastro: Int32Array[] = [];
  let achou = -1;
  for (let d = 0; d <= max && achou < 0; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && igual(x, y)) { x++; y++; }
      v[off + k] = x;
      if (x >= N && y >= M) { achou = d; break; }
    }
    rastro.push(v.slice(off - d, off + d + 1));
  }
  if (achou < 0) return null;

  const ler = (d: number, k: number) => rastro[d][k + d];
  let x = N, y = M;
  for (let d = achou; d > 0; d--) {
    const k = x - y;
    const anteriorK = k === -d || (k !== d && ler(d - 1, k - 1) < ler(d - 1, k + 1)) ? k + 1 : k - 1;
    const px = ler(d - 1, anteriorK), py = px - anteriorK;
    const desceu = anteriorK === k + 1; // desceu = palavra nova em B; senão, palavra tirada de A
    const sx = desceu ? px : px + 1, sy = desceu ? py + 1 : py;
    // Diagonal (palavras iguais) que veio depois do passo desta rodada.
    while (x > sx && y > sy) { passos.push(['igual', x - 1, y - 1]); x--; y--; }
    passos.push([desceu ? 'adicionado' : 'removido', px, py]);
    x = px; y = py;
  }
  while (x > 0 && y > 0) { passos.push(['igual', x - 1, y - 1]); x--; y--; }
  return passos.reverse();
}
