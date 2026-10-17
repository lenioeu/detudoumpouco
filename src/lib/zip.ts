// Monta um arquivo .zip simples, sem compressão ("store").
// PDF, JPG e PNG já são comprimidos: comprimir de novo quase não diminui e só deixa mais lento.
// Função pura: recebe bytes e devolve bytes, sem depender do navegador.

export interface ArquivoZip { nome: string; dados: Uint8Array; }

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Data e hora no formato do MS-DOS, usado pelo zip. */
function dataDos(d: Date): { hora: number; dia: number } {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    dia: (Math.max(d.getFullYear() - 1980, 0) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Evita nomes repetidos dentro do zip: "a.pdf", "a (2).pdf"... */
function nomesUnicos(nomes: string[]): string[] {
  const usados = new Set<string>();
  return nomes.map((nome) => {
    let final = nome, n = 2;
    while (usados.has(final.toLowerCase())) final = nome.replace(/(\.[^.]+)?$/, (ext) => ` (${n++})${ext}`);
    usados.add(final.toLowerCase());
    return final;
  });
}

export function criarZip(arquivos: ArquivoZip[], data = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { hora, dia } = dataDos(data);
  const nomes = nomesUnicos(arquivos.map((a) => a.nome)).map((n) => enc.encode(n));
  const locais: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let deslocamento = 0;

  arquivos.forEach((arq, i) => {
    const nome = nomes[i];
    const crc = crc32(arq.dados);
    const tam = arq.dados.length;

    const local = new Uint8Array(30 + nome.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);         // versão necessária
    l.setUint16(6, 0x0800, true);     // nomes em UTF-8
    l.setUint16(8, 0, true);          // sem compressão
    l.setUint16(10, hora, true);
    l.setUint16(12, dia, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, tam, true);
    l.setUint32(22, tam, true);
    l.setUint16(26, nome.length, true);
    local.set(nome, 30);
    locais.push(local, arq.dados);

    const central = new Uint8Array(46 + nome.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, dia, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, tam, true);
    c.setUint32(24, tam, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, deslocamento, true);
    central.set(nome, 46);
    centrais.push(central);

    deslocamento += local.length + tam;
  });

  const tamCentral = centrais.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, arquivos.length, true);
  f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tamCentral, true);
  f.setUint32(16, deslocamento, true);

  const partes = [...locais, ...centrais, fim];
  const total = partes.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { saida.set(p, pos); pos += p.length; }
  return saida;
}
