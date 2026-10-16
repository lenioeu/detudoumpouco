// Funções puras de imagem: formatos, tamanhos e recorte.
// Nada aqui toca no DOM, então dá para testar com números.

export interface Tamanho { largura: number; altura: number; }
export interface Retangulo { x: number; y: number; largura: number; altura: number; }
export type FormatoSaida = 'image/jpeg' | 'image/png' | 'image/webp';

/** Maior lado que os navegadores aceitam com folga num canvas. */
export const LADO_MAXIMO = 16384;
/** Área máxima (pixels) para não estourar a memória do celular. */
export const AREA_MAXIMA = 100_000_000;

/** "image/jpeg" -> "jpg" */
export function extensao(tipo: string): string {
  if (tipo === 'image/jpeg') return 'jpg';
  if (tipo === 'image/png') return 'png';
  if (tipo === 'image/webp') return 'webp';
  return tipo.split('/')[1] ?? 'img';
}

/** Nome curto para mostrar: "image/jpeg" -> "JPG" */
export function nomeFormato(tipo: string): string {
  return extensao(tipo).toUpperCase();
}

/** O arquivo parece HEIC/HEIF? Olha o tipo e, como muitos sistemas não informam o tipo, a extensão. */
export function ehHeic(nome: string, tipo: string): boolean {
  return /^image\/hei[cf](-sequence)?$/i.test(tipo) || /\.hei[cf]$/i.test(nome);
}

/** Formato de saída que preserva o original quando possível (PNG e WebP ficam; o resto vira JPG). */
export function formatoParecido(tipo: string): FormatoSaida {
  return tipo === 'image/png' || tipo === 'image/webp' ? tipo : 'image/jpeg';
}

/** Só JPG perde a transparência. */
export function aceitaTransparencia(tipo: string): boolean {
  return tipo !== 'image/jpeg';
}

/** Diminui o tamanho, sem mudar a proporção, até caber nos limites do navegador. */
export function caberNoLimite(t: Tamanho): Tamanho {
  let { largura, altura } = t;
  const fator = Math.min(1, LADO_MAXIMO / largura, LADO_MAXIMO / altura, Math.sqrt(AREA_MAXIMA / (largura * altura)));
  if (fator < 1) { largura *= fator; altura *= fator; }
  return { largura: Math.max(1, Math.round(largura)), altura: Math.max(1, Math.round(altura)) };
}

/** Dado um lado, calcula o outro mantendo a proporção do original. */
export function proporcional(original: Tamanho, campo: 'largura' | 'altura', valor: number): Tamanho {
  const v = Math.max(1, Math.round(valor));
  return campo === 'largura'
    ? { largura: v, altura: Math.max(1, Math.round((v * original.altura) / original.largura)) }
    : { altura: v, largura: Math.max(1, Math.round((v * original.largura) / original.altura)) };
}

export type OpcoesTamanho =
  | { modo: 'porcentagem'; porcentagem: number }
  | { modo: 'pixels'; largura: number; altura: number; manter: boolean; base: 'largura' | 'altura'; naoAumentar?: boolean };

/**
 * Tamanho final de uma imagem.
 * - porcentagem: 50 deixa a imagem com metade da largura e metade da altura.
 * - pixels com "manter": usa o lado `base` e calcula o outro pela proporção da própria imagem
 *   (assim funciona em lote, com fotos em pé e deitadas). Com `naoAumentar`, imagens que já são
 *   menores que o pedido ficam como estão.
 * - pixels sem "manter": usa largura e altura exatas (pode esticar).
 */
export function calcularTamanho(original: Tamanho, o: OpcoesTamanho): Tamanho {
  let t: Tamanho;
  if (o.modo === 'porcentagem') {
    const f = Math.max(0, o.porcentagem) / 100;
    t = { largura: Math.max(1, Math.round(original.largura * f)), altura: Math.max(1, Math.round(original.altura * f)) };
  } else if (o.manter) {
    t = proporcional(original, o.base, o.base === 'largura' ? o.largura : o.altura);
    if (o.naoAumentar && t.largura > original.largura) t = { ...original };
  } else {
    t = { largura: Math.max(1, Math.round(o.largura)), altura: Math.max(1, Math.round(o.altura)) };
  }
  return caberNoLimite(t);
}

// ---------- Recorte ----------

function limitar(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** "16:9" -> 1,777…; "livre" ou inválido -> null */
export function lerProporcao(texto: string): number | null {
  const m = /^(\d+(?:[.,]\d+)?)\s*[:x]\s*(\d+(?:[.,]\d+)?)$/i.exec(texto.trim());
  if (!m) return null;
  const a = Number(m[1].replace(',', '.')), b = Number(m[2].replace(',', '.'));
  return a > 0 && b > 0 ? a / b : null;
}

/** Arredonda e mantém o retângulo dentro da imagem, com pelo menos 1 px. */
export function limitarRecorte(r: Retangulo, img: Tamanho): Retangulo {
  const largura = limitar(Math.round(r.largura), 1, img.largura);
  const altura = limitar(Math.round(r.altura), 1, img.altura);
  return {
    largura, altura,
    x: limitar(Math.round(r.x), 0, img.largura - largura),
    y: limitar(Math.round(r.y), 0, img.altura - altura),
  };
}

/** O maior retângulo com a proporção pedida que cabe em `caixa`. */
function maiorQueCabe(caixa: Tamanho, proporcao: number): Tamanho {
  return caixa.largura / caixa.altura > proporcao
    ? { largura: caixa.altura * proporcao, altura: caixa.altura }
    : { largura: caixa.largura, altura: caixa.largura / proporcao };
}

/** Recorte inicial: a maior área possível na proporção, centralizada (ou a imagem toda, se livre). */
export function recorteInicial(img: Tamanho, proporcao: number | null): Retangulo {
  if (!proporcao) return { x: 0, y: 0, ...img };
  const t = maiorQueCabe(img, proporcao);
  return limitarRecorte({ x: (img.largura - t.largura) / 2, y: (img.altura - t.altura) / 2, ...t }, img);
}

/** Troca a proporção de um recorte, mantendo o centro e mais ou menos a mesma área. */
export function aplicarProporcao(r: Retangulo, img: Tamanho, proporcao: number | null): Retangulo {
  if (!proporcao) return limitarRecorte(r, img);
  const area = r.largura * r.altura;
  let largura = Math.sqrt(area * proporcao), altura = largura / proporcao;
  if (largura > img.largura || altura > img.altura) ({ largura, altura } = maiorQueCabe(img, proporcao));
  const cx = r.x + r.largura / 2, cy = r.y + r.altura / 2;
  return limitarRecorte({ x: cx - largura / 2, y: cy - altura / 2, largura, altura }, img);
}

export type Alca = 'mover' | 'no' | 'ne' | 'so' | 'se';

/**
 * Novo recorte depois de arrastar uma alça por (dx, dy) pixels da imagem.
 * Os cantos (no = noroeste, se = sudeste…) mudam o tamanho com o canto oposto parado;
 * "mover" desliza o recorte inteiro. Nunca sai da imagem e respeita a proporção, se houver.
 */
export function arrastarRecorte(
  inicio: Retangulo, alca: Alca, dx: number, dy: number, img: Tamanho, proporcao: number | null, minimo = 16,
): Retangulo {
  if (alca === 'mover') {
    return {
      ...inicio,
      x: Math.round(limitar(inicio.x + dx, 0, img.largura - inicio.largura)),
      y: Math.round(limitar(inicio.y + dy, 0, img.altura - inicio.altura)),
    };
  }
  const leste = alca === 'ne' || alca === 'se';
  const sul = alca === 'so' || alca === 'se';
  // Canto fixo (o oposto ao arrastado).
  const fx = leste ? inicio.x : inicio.x + inicio.largura;
  const fy = sul ? inicio.y : inicio.y + inicio.altura;
  const espacoX = leste ? img.largura - fx : fx;
  const espacoY = sul ? img.altura - fy : fy;
  const min = Math.min(minimo, espacoX, espacoY);

  let largura = (leste ? inicio.largura + dx : inicio.largura - dx);
  let altura = (sul ? inicio.altura + dy : inicio.altura - dy);
  largura = limitar(largura, min, espacoX);
  altura = limitar(altura, min, espacoY);

  if (proporcao) {
    // Segue o lado que mais cresceu e depois encolhe para caber.
    if (largura / altura > proporcao) altura = largura / proporcao; else largura = altura * proporcao;
    if (largura > espacoX) { largura = espacoX; altura = largura / proporcao; }
    if (altura > espacoY) { altura = espacoY; largura = altura * proporcao; }
  }
  return {
    x: Math.round(leste ? fx : fx - largura),
    y: Math.round(sul ? fy : fy - altura),
    largura: Math.round(largura),
    altura: Math.round(altura),
  };
}
