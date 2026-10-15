import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatarTelefone } from "../telefone.js";

export type SignatarioNaPagina = { papel: string; nome: string; telefone: string };

/** Posição de um campo em porcentagem da página, origem no canto superior esquerdo (padrão do Documenso). */
export type CampoPosicionado = {
  signatario: number;
  tipo: "SIGNATURE" | "DATE";
  pagina: number;
  x: number;
  y: number;
  largura: number;
  altura: number;
};

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 56;
const ALTURA_BLOCO = 128;
const BLOCOS_POR_PAGINA = 5;

export function sha256(dados: Uint8Array): string {
  return createHash("sha256").update(dados).digest("hex");
}

/**
 * Acrescenta ao fim do PDF uma página de assinaturas, com um bloco por signatário,
 * e devolve onde ficaram os campos de assinatura e data de cada um.
 *
 * Assim qualquer PDF pode ser enviado, sem precisar descobrir onde ficam as linhas
 * de assinatura no documento original.
 */
export async function acrescentarPaginaDeAssinaturas(
  original: Uint8Array,
  titulo: string,
  signatarios: SignatarioNaPagina[],
): Promise<{ pdf: Uint8Array; campos: CampoPosicionado[]; hashOriginal: string }> {
  const hashOriginal = sha256(original);
  const doc = await PDFDocument.load(original, { ignoreEncryption: false });
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const campos: CampoPosicionado[] = [];

  for (let inicio = 0; inicio < signatarios.length; inicio += BLOCOS_POR_PAGINA) {
    const pagina = doc.addPage([A4.largura, A4.altura]);
    const numeroPagina = doc.getPageCount(); // 1-based, é a página recém-criada
    let y = A4.altura - MARGEM;

    y = escrever(pagina, "PÁGINA DE ASSINATURAS", MARGEM, y, negrito, 14);
    y = escrever(pagina, titulo, MARGEM, y - 6, fonte, 11, A4.largura - 2 * MARGEM);
    y = escrever(
      pagina,
      `SHA-256 do documento original: ${hashOriginal}`,
      MARGEM,
      y - 4,
      fonte,
      7,
      A4.largura - 2 * MARGEM,
    );
    y = escrever(
      pagina,
      "Assinaturas eletrônicas coletadas com envio individual do link ao WhatsApp de cada signatário " +
        "(MP 2.200-2/2001, art. 10, § 2º). O histórico de cada assinatura consta no certificado anexo.",
      MARGEM,
      y - 4,
      fonte,
      8,
      A4.largura - 2 * MARGEM,
    );
    y -= 16;

    signatarios.slice(inicio, inicio + BLOCOS_POR_PAGINA).forEach((s, i) => {
      const indice = inicio + i;
      const topo = y - i * ALTURA_BLOCO;
      const larguraUtil = A4.largura - 2 * MARGEM;

      pagina.drawRectangle({
        x: MARGEM,
        y: topo - ALTURA_BLOCO + 12,
        width: larguraUtil,
        height: ALTURA_BLOCO - 12,
        borderColor: rgb(0.75, 0.75, 0.75),
        borderWidth: 0.75,
      });
      let linha = escrever(pagina, `${s.papel.toUpperCase()}: ${s.nome}`, MARGEM + 10, topo - 8, negrito, 10, larguraUtil - 20);
      linha = escrever(pagina, `WhatsApp: ${formatarTelefone(s.telefone)}`, MARGEM + 10, linha, fonte, 8);

      // Linha de assinatura e campo de data, que o Documenso preenche
      const assinatura = { x: MARGEM + 10, y: linha - 50, largura: 300, altura: 44 };
      const data = { x: MARGEM + 330, y: linha - 50, largura: 150, altura: 22 };
      pagina.drawLine({
        start: { x: assinatura.x, y: assinatura.y },
        end: { x: assinatura.x + assinatura.largura, y: assinatura.y },
        thickness: 0.5,
        color: rgb(0.3, 0.3, 0.3),
      });
      escrever(pagina, "Assinatura", assinatura.x, assinatura.y - 3, fonte, 7);
      escrever(pagina, "Data", data.x, data.y - 3, fonte, 7);

      campos.push(
        posicionar(indice, "SIGNATURE", numeroPagina, assinatura),
        posicionar(indice, "DATE", numeroPagina, data),
      );
    });
  }

  return { pdf: await doc.save(), campos, hashOriginal };
}

/** Converte um retângulo em pontos (origem embaixo à esquerda, y = base) para porcentagem com origem no topo. */
function posicionar(
  signatario: number,
  tipo: CampoPosicionado["tipo"],
  pagina: number,
  r: { x: number; y: number; largura: number; altura: number },
): CampoPosicionado {
  const pct = (v: number, total: number) => Math.round((v / total) * 10000) / 100;
  return {
    signatario,
    tipo,
    pagina,
    x: pct(r.x, A4.largura),
    y: pct(A4.altura - (r.y + r.altura), A4.altura),
    largura: pct(r.largura, A4.largura),
    altura: pct(r.altura, A4.altura),
  };
}

/** Escreve texto com quebra de linha simples e devolve o y da próxima linha. */
function escrever(
  pagina: PDFPage,
  texto: string,
  x: number,
  y: number,
  fonte: PDFFont,
  tamanho: number,
  larguraMaxima = Infinity,
): number {
  const altura = tamanho * 1.35;
  let atual = "";
  let linhaY = y - tamanho;
  for (const palavra of compativel(texto, fonte).split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (atual && fonte.widthOfTextAtSize(tentativa, tamanho) > larguraMaxima) {
      pagina.drawText(atual, { x, y: linhaY, size: tamanho, font: fonte });
      linhaY -= altura;
      atual = palavra;
    } else {
      atual = tentativa;
    }
  }
  if (atual) pagina.drawText(atual, { x, y: linhaY, size: tamanho, font: fonte });
  return linhaY - (altura - tamanho);
}

/** As fontes padrão do PDF só cobrem o alfabeto latino (WinAnsi); troca o resto por "?". */
function compativel(texto: string, fonte: PDFFont): string {
  return [...texto]
    .map((c) => {
      try {
        fonte.encodeText(c);
        return c;
      } catch {
        return "?";
      }
    })
    .join("");
}
