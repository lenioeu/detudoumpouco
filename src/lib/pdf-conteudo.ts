// Funções puras usadas pelo "Comprimir PDF": leitura do conteúdo das páginas (onde cada imagem
// aparece e em que tamanho), filtros PNG de imagens Flate, limpeza de EXIF e as contas da previsão.
// Nada aqui depende do navegador.

/** Matriz de transformação do PDF: [a b c d e f]. */
export type Matriz = [number, number, number, number, number, number];
export const IDENTIDADE: Matriz = [1, 0, 0, 1, 0, 0];

/** m × n (aplica m primeiro e depois n), como o operador "cm" do PDF. */
export function multiplicar(m: Matriz, n: Matriz): Matriz {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

/** Largura e altura (em pontos) do quadrado 1 x 1 da imagem desenhado com esta matriz. */
export function tamanhoNaPagina(m: Matriz): { largura: number; altura: number } {
  return { largura: Math.hypot(m[0], m[1]), altura: Math.hypot(m[2], m[3]) };
}

const ESPACO = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) ESPACO[c] = 1;
const DELIMITADOR = new Uint8Array(256);
for (const c of '()<>[]{}/%') DELIMITADOR[c.charCodeAt(0)] = 1;

/**
 * Percorre um fluxo de conteúdo (os comandos que desenham a página) e chama `aoDesenhar`
 * a cada "Do" (desenhar XObject), com o nome do recurso e a matriz em vigor naquele ponto.
 * Só acompanha q, Q e cm: é o que define onde e em que tamanho a imagem aparece.
 * Textos, imagens embutidas (BI…EI) e comentários são pulados sem interpretar.
 */
export function percorrerConteudo(
  bytes: Uint8Array,
  inicial: Matriz,
  aoDesenhar: (nome: string, ctm: Matriz) => void,
): void {
  const n = bytes.length;
  let ctm = inicial;
  const pilha: Matriz[] = [];
  const numeros: number[] = [];
  let ultimoNome = '';
  let i = 0;
  const palavra = (ini: number) => {
    let s = '';
    for (let k = ini; k < i; k++) s += String.fromCharCode(bytes[k]);
    return s;
  };

  while (i < n) {
    const c = bytes[i];
    if (ESPACO[c]) { i++; continue; }
    if (c === 0x25) { // % comentário até o fim da linha
      while (i < n && bytes[i] !== 10 && bytes[i] !== 13) i++;
      continue;
    }
    if (c === 0x28) { // ( texto ) com parênteses aninhados e escapes
      let nivel = 1; i++;
      while (i < n && nivel > 0) {
        const d = bytes[i];
        if (d === 0x5c) i += 2;
        else { if (d === 0x28) nivel++; else if (d === 0x29) nivel--; i++; }
      }
      numeros.length = 0;
      continue;
    }
    if (c === 0x3c) { // << dicionário ou <hex>
      if (bytes[i + 1] === 0x3c) { i += 2; continue; }
      while (i < n && bytes[i] !== 0x3e) i++;
      i++;
      continue;
    }
    if (c === 0x3e || c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d) { i++; continue; }
    if (c === 0x2f) { // /Nome
      const ini = ++i;
      while (i < n && !ESPACO[bytes[i]] && !DELIMITADOR[bytes[i]]) i++;
      ultimoNome = palavra(ini); // como está no arquivo; o PDFName.of do pdf-lib decodifica os #xx
      continue;
    }
    // número ou operador
    const ini = i;
    while (i < n && !ESPACO[bytes[i]] && !DELIMITADOR[bytes[i]]) i++;
    if (i === ini) { i++; continue; }
    const t = palavra(ini);
    const ch = t.charCodeAt(0);
    if ((ch >= 48 && ch <= 57) || ch === 43 || ch === 45 || ch === 46) {
      const v = Number(t);
      numeros.push(Number.isFinite(v) ? v : 0);
      if (numeros.length > 12) numeros.shift();
      continue;
    }
    switch (t) {
      case 'q': pilha.push(ctm); break;
      case 'Q': ctm = pilha.pop() ?? ctm; break;
      case 'cm':
        if (numeros.length >= 6) ctm = multiplicar(numeros.slice(-6) as Matriz, ctm);
        break;
      case 'Do':
        if (ultimoNome) aoDesenhar(ultimoNome, ctm);
        break;
      case 'ID': {
        // Dados binários de uma imagem embutida: pula até o "EI" cercado de espaços.
        i++;
        while (i < n) {
          if (bytes[i] === 0x45 && bytes[i + 1] === 0x49 && ESPACO[bytes[i - 1]] && (i + 2 >= n || ESPACO[bytes[i + 2]])) { i += 2; break; }
          i++;
        }
        break;
      }
    }
    numeros.length = 0;
  }
}

/**
 * Desfaz os filtros PNG (Predictor 10 a 15) de uma imagem FlateDecode de 8 bits.
 * Devolve só os pixels, linha após linha, sem o byte de filtro de cada linha.
 */
export function desfazerPreditorPng(dados: Uint8Array, colunas: number, cores: number): Uint8Array {
  const bpp = cores;
  const linha = colunas * cores;
  const linhas = Math.floor(dados.length / (linha + 1));
  const saida = new Uint8Array(linhas * linha);
  for (let y = 0; y < linhas; y++) {
    const filtro = dados[y * (linha + 1)];
    const ent = y * (linha + 1) + 1;
    const sai = y * linha;
    const ant = sai - linha;
    for (let x = 0; x < linha; x++) {
      const bruto = dados[ent + x];
      const a = x >= bpp ? saida[sai + x - bpp] : 0;
      const b = y > 0 ? saida[ant + x] : 0;
      const cc = y > 0 && x >= bpp ? saida[ant + x - bpp] : 0;
      let v: number;
      switch (filtro) {
        case 1: v = bruto + a; break;
        case 2: v = bruto + b; break;
        case 3: v = bruto + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc);
          v = bruto + (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc);
          break;
        }
        default: v = bruto;
      }
      saida[sai + x] = v & 0xff;
    }
  }
  return saida;
}

/** Pixels RGB ou cinza (8 bits) para RGBA opaco, o formato do canvas. */
export function paraRgba(pixels: Uint8Array, largura: number, altura: number, cores: 1 | 3): Uint8ClampedArray<ArrayBuffer> {
  const total = largura * altura;
  const rgba = new Uint8ClampedArray(total * 4);
  if (cores === 3) {
    for (let p = 0, q = 0; p < total; p++, q += 3) {
      const o = p * 4;
      rgba[o] = pixels[q]; rgba[o + 1] = pixels[q + 1]; rgba[o + 2] = pixels[q + 2]; rgba[o + 3] = 255;
    }
  } else {
    for (let p = 0; p < total; p++) {
      const o = p * 4, v = pixels[p];
      rgba[o] = v; rgba[o + 1] = v; rgba[o + 2] = v; rgba[o + 3] = 255;
    }
  }
  return rgba;
}

/**
 * Tira os blocos EXIF (APP1) de um JPEG. No PDF a orientação da câmera não vale:
 * sem isso, o navegador poderia girar a foto ao decodificar.
 */
export function semExif(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const partes: Uint8Array[] = [bytes.subarray(0, 2)];
  let pos = 2, mudou = false;
  while (pos + 4 <= bytes.length && bytes[pos] === 0xff) {
    const marcador = bytes[pos + 1];
    if (marcador === 0xda || marcador === 0xd9) break;
    const tam = (bytes[pos + 2] << 8) | bytes[pos + 3];
    const fim = pos + 2 + tam;
    const exif = marcador === 0xe1 && bytes[pos + 4] === 0x45 && bytes[pos + 5] === 0x78 && bytes[pos + 6] === 0x69 && bytes[pos + 7] === 0x66;
    if (exif) mudou = true; else partes.push(bytes.subarray(pos, fim));
    pos = fim;
  }
  if (!mudou) return bytes;
  partes.push(bytes.subarray(pos));
  const saida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) { saida.set(p, o); o += p.length; }
  return saida;
}

// ---------------------------------------------------------------------------------------------
// Níveis de compressão

/** Um degrau de compressão: resolução das imagens (pontos por polegada) e qualidade do JPEG. */
export interface Degrau { dpi: number; qualidade: number; }

/**
 * Escada usada pelo "Tamanho alvo", do mais leve ao mais forte.
 * Os níveis Leve, Recomendada e Forte são degraus desta escada.
 */
export const ESCADA: Degrau[] = [
  { dpi: 220, qualidade: 0.86 },
  { dpi: 200, qualidade: 0.82 }, // Leve
  { dpi: 175, qualidade: 0.76 },
  { dpi: 150, qualidade: 0.7 }, // Recomendada
  { dpi: 125, qualidade: 0.6 },
  { dpi: 100, qualidade: 0.5 }, // Forte
  { dpi: 85, qualidade: 0.43 },
  { dpi: 72, qualidade: 0.36 },
  { dpi: 60, qualidade: 0.3 },
];
export const DEGRAU_DO_NIVEL = { leve: 1, recomendada: 3, forte: 5 } as const;
export type NivelImagens = keyof typeof DEGRAU_DO_NIVEL;

/** Modo "Máxima": cada página vira uma foto JPEG nesta resolução e qualidade. */
export const RASTER: Degrau = { dpi: 100, qualidade: 0.5 };

/** Só troca a imagem se a nova for pelo menos 8% menor: evita perder qualidade por quase nada. */
export const GANHO_MINIMO = 0.92;

/** Imagens menores que isto não valem o trabalho de recomprimir. */
export const BYTES_MINIMOS = 12 * 1024;

/**
 * Fator de redução (0 a 1) de uma imagem para chegar ao dpi pedido.
 * `ptPorPixel` é o maior tamanho em que a imagem aparece, em pontos por pixel (null = não se sabe;
 * aí a imagem não é reduzida, só recomprimida).
 */
export function fatorDeReducao(ptPorPixel: number | null, dpi: number): number {
  if (!ptPorPixel || !(ptPorPixel > 0)) return 1;
  const f = (ptPorPixel * dpi) / 72;
  return f >= 0.9 ? 1 : Math.max(f, 0.01);
}

/** Tamanho final em pixels, sem passar da área máxima de canvas que os celulares aceitam. */
export function tamanhoFinal(largura: number, altura: number, fator: number, areaMaxima: number): { largura: number; altura: number } {
  let f = fator;
  if (largura * altura * f * f > areaMaxima) f = Math.sqrt(areaMaxima / (largura * altura)) * 0.99;
  return { largura: Math.max(1, Math.round(largura * f)), altura: Math.max(1, Math.round(altura * f)) };
}

// ---------------------------------------------------------------------------------------------
// Previsão de tamanho por amostragem

/**
 * Escolhe quais imagens entram na amostra (índices): metade são as maiores, que pesam mais
 * no total, e o resto é espalhado entre as demais, para a amostra representar todos os tamanhos.
 */
export function escolherAmostra(tamanhos: number[], quantas: number): number[] {
  const ordem = tamanhos.map((_, i) => i).sort((a, b) => tamanhos[b] - tamanhos[a]);
  if (ordem.length <= quantas) return ordem;
  const maiores = Math.ceil(quantas / 2);
  const escolhidas = ordem.slice(0, maiores);
  const resto = ordem.slice(maiores);
  const faltam = quantas - maiores;
  for (let k = 0; k < faltam; k++) escolhidas.push(resto[Math.floor(((k + 0.5) * resto.length) / faltam)]);
  return escolhidas;
}

export const EXPOENTE_COMPLEXIDADE = 0.25;

export interface ImagemParaPrever {
  /** Bytes atuais da imagem no arquivo. */
  bytes: number;
  /** Pixels da imagem hoje. */
  pixelsOriginais: number;
  /** Pixels que a imagem terá depois de reduzida, para cada degrau da escada. */
  pixelsFinais: number[];
  /** Resultado medido de verdade (só para as imagens da amostra): bytes do JPEG novo em cada degrau. */
  medido?: (number | undefined)[];
  /** Grupo para a conta de bytes por pixel (JPEG e Flate comprimem diferente). */
  grupo: string;
}

/**
 * Prevê quantos bytes as imagens economizam em cada degrau.
 * As imagens da amostra usam o tamanho medido; as outras usam os bytes por pixel da amostra
 * do mesmo grupo (ou de todas, se o grupo não tiver amostra).
 * Uma imagem só conta como trocada se ficar abaixo de GANHO_MINIMO do tamanho atual.
 */
export function preverEconomia(imagens: ImagemParaPrever[], degrau: number): number | null {
  // Peso de "complexidade": imagens com mais bytes por pixel hoje (mais detalhe, mais ruído)
  // também geram JPEGs maiores.
  const peso = (img: ImagemParaPrever) => Math.pow(img.bytes / Math.max(img.pixelsOriginais, 1), EXPOENTE_COMPLEXIDADE);
  const porGrupo = new Map<string, { bytes: number; pixels: number }>();
  const geral = { bytes: 0, pixels: 0 };
  for (const img of imagens) {
    const m = img.medido?.[degrau];
    if (m === undefined) continue;
    const px = img.pixelsFinais[degrau] * peso(img);
    const g = porGrupo.get(img.grupo) ?? { bytes: 0, pixels: 0 };
    g.bytes += m; g.pixels += px;
    porGrupo.set(img.grupo, g);
    geral.bytes += m; geral.pixels += px;
  }
  if (imagens.length && !geral.pixels) return null;
  let economia = 0;
  for (const img of imagens) {
    let novo = img.medido?.[degrau];
    if (novo === undefined) {
      const g = porGrupo.get(img.grupo) ?? geral;
      novo = (g.bytes / g.pixels) * img.pixelsFinais[degrau] * peso(img);
    }
    if (novo < img.bytes * GANHO_MINIMO) economia += img.bytes - novo;
  }
  return economia;
}

/**
 * Busca, numa lista de tamanhos que cresce com o índice (do mais leve ao mais forte, o tamanho cai),
 * o degrau mais leve que fica até `alvo`. `medir` pode ser caro: o primeiro palpite vem de `inicio`.
 * Devolve o índice e quantas medições fez, ou -1 se nem o mais forte chega.
 */
export async function buscarDegrau(
  quantos: number,
  alvo: number,
  medir: (i: number) => Promise<number>,
  inicio = Math.floor(quantos / 2),
): Promise<{ indice: number; medicoes: number }> {
  const cache = new Map<number, number>();
  const valor = async (i: number) => {
    if (!cache.has(i)) cache.set(i, await medir(i));
    return cache.get(i)!;
  };
  // Procura o menor índice i com valor(i) <= alvo, sabendo que o valor cai quando i cresce.
  let lo = 0, hi = quantos - 1, achado = -1;
  let palpite = Math.min(Math.max(inicio, 0), quantos - 1);
  while (lo <= hi) {
    const meio = palpite >= lo && palpite <= hi ? palpite : Math.floor((lo + hi) / 2);
    palpite = -1;
    if ((await valor(meio)) <= alvo) { achado = meio; hi = meio - 1; }
    else lo = meio + 1;
  }
  return { indice: achado, medicoes: cache.size };
}
