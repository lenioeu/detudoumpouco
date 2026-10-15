import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { mascararCpf } from "../cpf.js";
import { formatarTelefone } from "../telefone.js";

export type SignatarioNaPagina = { papel: string; nome: string; telefone: string };

/** Área reservada para o carimbo de assinatura de um signatário, em pontos (origem embaixo à esquerda). */
export type Bloco = { signatario: number; pagina: number; x: number; y: number; largura: number; altura: number };

/** O que foi registrado de cada assinatura, para o carimbo e o manifesto. */
export type RegistroDeAssinatura = SignatarioNaPagina & {
  cpf: string;
  linkEnviadoEm: string | null;
  visualizadoEm: string | null;
  assinadoEm: string;
  mensagemId: string;
};

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 56;
const LARGURA_UTIL = A4[0] - 2 * MARGEM;
const ALTURA_BLOCO = 118;
const CINZA = rgb(0.35, 0.35, 0.35);

export function sha256(dados: Uint8Array): string {
  return createHash("sha256").update(dados).digest("hex");
}

export function formatarDataHora(iso: string): string {
  const texto = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(iso));
  return `${texto.replace(",", " às")} (horário de Brasília)`;
}

/**
 * Acrescenta ao fim do PDF uma página de assinaturas com um bloco por signatário.
 * Esta é a versão que cada pessoa lê e assina; os blocos são preenchidos no final.
 */
export async function prepararDocumento(
  original: Uint8Array,
  titulo: string,
  signatarios: SignatarioNaPagina[],
): Promise<{ pdf: Uint8Array; blocos: Bloco[]; hashOriginal: string }> {
  const hashOriginal = sha256(original);
  const doc = await PDFDocument.load(original);
  const e = await Escritor.criar(doc);
  const blocos: Bloco[] = [];

  e.titulo("PÁGINA DE ASSINATURAS");
  e.texto(titulo, 11);
  e.texto(`SHA-256 do documento original: ${hashOriginal}`, 7, CINZA);
  e.texto(
    "As partes abaixo assinam eletronicamente este documento por meio do WhatsApp, " +
      "nos termos do art. 10, § 2º, da MP 2.200-2/2001. O registro de cada assinatura consta no manifesto ao final.",
    8,
    CINZA,
  );
  e.espaco(10);

  signatarios.forEach((s, i) => {
    e.garantir(ALTURA_BLOCO);
    const topo = e.y;
    e.pagina.drawRectangle({
      x: MARGEM,
      y: topo - ALTURA_BLOCO + 10,
      width: LARGURA_UTIL,
      height: ALTURA_BLOCO - 10,
      borderColor: rgb(0.75, 0.75, 0.75),
      borderWidth: 0.75,
    });
    e.y -= 8;
    e.texto(`${s.papel.toUpperCase()}: ${s.nome}`, 10, undefined, true, 10);
    e.texto(`WhatsApp: ${formatarTelefone(s.telefone)}`, 8, CINZA, false, 10);

    const area = { x: MARGEM + 10, y: topo - ALTURA_BLOCO + 26, largura: LARGURA_UTIL - 20, altura: 46 };
    e.pagina.drawLine({
      start: { x: area.x, y: area.y },
      end: { x: area.x + area.largura, y: area.y },
      thickness: 0.5,
      color: CINZA,
    });
    e.pagina.drawText("Assinatura eletrônica", { x: area.x, y: area.y - 10, size: 7, font: e.fonte, color: CINZA });
    blocos.push({ signatario: i, pagina: doc.getPageCount() - 1, ...area });
    e.y = topo - ALTURA_BLOCO;
  });

  return { pdf: await doc.save(), blocos, hashOriginal };
}

/**
 * Preenche os blocos com o carimbo de cada assinatura e acrescenta o manifesto.
 * O resultado ainda precisa da assinatura digital do arquivo (AssinadorDePdf).
 */
export async function finalizarDocumento(
  apresentado: Uint8Array,
  blocos: Bloco[],
  dados: {
    titulo: string;
    codigo: string;
    criadoEm: string;
    hashOriginal: string;
    remetente: string;
    registros: RegistroDeAssinatura[];
  },
): Promise<Uint8Array> {
  const hashApresentado = sha256(apresentado);
  const doc = await PDFDocument.load(apresentado);
  const e = await Escritor.criar(doc, false);

  for (const b of blocos) {
    const r = dados.registros[b.signatario];
    if (!r) continue;
    const pagina = doc.getPage(b.pagina);
    const linhas = [
      { t: `Assinado eletronicamente por ${r.nome}`, negrito: true },
      { t: `CPF ${mascararCpf(r.cpf)} - WhatsApp ${formatarTelefone(r.telefone)}`, negrito: false },
      { t: `em ${formatarDataHora(r.assinadoEm)}`, negrito: false },
    ];
    linhas.forEach((l, i) => {
      pagina.drawText(compativel(l.t, e.fonte), {
        x: b.x + 4,
        y: b.y + b.altura - 14 - i * 12,
        size: 9,
        font: l.negrito ? e.negrito : e.fonte,
        color: rgb(0.05, 0.25, 0.55),
      });
    });
  }

  e.novaPagina();
  e.titulo("MANIFESTO DE ASSINATURAS ELETRÔNICAS");
  e.texto(dados.titulo, 11);
  e.espaco(4);
  e.campo("Código do documento", dados.codigo);
  e.campo("Enviado por", dados.remetente);
  e.campo("Enviado para assinatura em", formatarDataHora(dados.criadoEm));
  e.campo("SHA-256 do documento original", dados.hashOriginal);
  e.campo("SHA-256 da versão assinada (com página de assinaturas)", hashApresentado);
  e.espaco(8);

  dados.registros.forEach((r, i) => {
    e.garantir(110);
    e.texto(`${i + 1}. ${r.nome} (${r.papel})`, 10, undefined, true);
    e.campo("CPF informado", mascararCpf(r.cpf));
    e.campo("WhatsApp", formatarTelefone(r.telefone));
    if (r.linkEnviadoEm) e.campo("Convite enviado", formatarDataHora(r.linkEnviadoEm));
    if (r.visualizadoEm) e.campo("Documento recebido no WhatsApp", formatarDataHora(r.visualizadoEm));
    e.campo("Assinatura confirmada", formatarDataHora(r.assinadoEm));
    e.campo("ID da mensagem de confirmação", r.mensagemId);
    e.espaco(6);
  });

  e.espaco(6);
  e.texto(
    "Cada signatário recebeu o documento no próprio WhatsApp, declarou ter lido e concordado ao tocar em \"Assinar\" " +
      "e confirmou a identidade informando o CPF. Os códigos SHA-256 acima permitem verificar que o conteúdo não foi " +
      "alterado. O arquivo é assinado digitalmente; alterações posteriores invalidam essa assinatura.",
    8,
    CINZA,
  );

  return doc.save();
}

/** Escreve texto em sequência, quebrando linhas e páginas automaticamente. */
class Escritor {
  pagina!: PDFPage;
  y = 0;

  private constructor(
    private readonly doc: PDFDocument,
    readonly fonte: PDFFont,
    readonly negrito: PDFFont,
  ) {}

  static async criar(doc: PDFDocument, abrirPagina = true): Promise<Escritor> {
    const e = new Escritor(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
    if (abrirPagina) e.novaPagina();
    return e;
  }

  novaPagina(): void {
    this.pagina = this.doc.addPage(A4);
    this.y = A4[1] - MARGEM;
  }

  garantir(altura: number): void {
    if (this.y - altura < MARGEM) this.novaPagina();
  }

  espaco(pontos: number): void {
    this.y -= pontos;
  }

  titulo(t: string): void {
    this.texto(t, 14, undefined, true);
    this.espaco(4);
  }

  campo(rotulo: string, valor: string): void {
    this.texto(`${rotulo}: ${valor}`, 8, undefined, false, 12);
  }

  texto(t: string, tamanho: number, cor = rgb(0, 0, 0), emNegrito = false, recuo = 0): void {
    const fonte = emNegrito ? this.negrito : this.fonte;
    const largura = LARGURA_UTIL - recuo;
    const altura = tamanho * 1.35;
    let linha = "";
    const escreverLinha = () => {
      this.garantir(altura);
      this.pagina.drawText(linha, { x: MARGEM + recuo, y: this.y - tamanho, size: tamanho, font: fonte, color: cor });
      this.y -= altura;
    };
    for (const palavra of quebrarPalavras(compativel(t, fonte), fonte, tamanho, largura)) {
      const tentativa = linha ? `${linha} ${palavra}` : palavra;
      if (linha && fonte.widthOfTextAtSize(tentativa, tamanho) > largura) {
        escreverLinha();
        linha = palavra;
      } else {
        linha = tentativa;
      }
    }
    if (linha) escreverLinha();
    this.y -= 2;
  }
}

/** Divide palavras maiores que a linha (ex.: hashes) em pedaços que caibam. */
function quebrarPalavras(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  return texto.split(/\s+/).flatMap((p) => {
    if (fonte.widthOfTextAtSize(p, tamanho) <= largura) return [p];
    const pedacos: string[] = [];
    let atual = "";
    for (const c of p) {
      if (fonte.widthOfTextAtSize(atual + c, tamanho) > largura) {
        pedacos.push(atual);
        atual = c;
      } else {
        atual += c;
      }
    }
    return [...pedacos, atual];
  });
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
