import { createHash } from "node:crypto";
import { PDFDocument, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { formatarCpf } from "../cpf.js";
import { formatarTelefone } from "../telefone.js";
import type { LinhaDeAssinatura } from "./linhas.js";

export type SignatarioNaPagina = { papel: string; nome: string; telefone: string };

/**
 * Área onde vai o carimbo de assinatura de um signatário, em pontos (origem embaixo à esquerda):
 * na página de assinaturas ou na linha de assinatura do próprio documento.
 */
export type Bloco = {
  signatario: number;
  pagina: number;
  x: number;
  y: number;
  largura: number;
  altura: number;
  origem?: "pagina" | "documento";
};

/** O que foi registrado de cada assinatura, para o carimbo e o manifesto. */
export type RegistroDeAssinatura = SignatarioNaPagina & {
  cpf: string;
  linkEnviadoEm: string | null;
  visualizadoEm: string | null;
  assinadoEm: string;
  mensagemId: string;
  /** Selfie segurando documento de identidade, quando o envio pediu. */
  selfie?: { dados: Uint8Array; tipo: string } | null;
  /** Quantos lembretes a pessoa recebeu antes de assinar. */
  lembretes?: number;
};

/**
 * Simples (art. 4º, I) por padrão; avançada (art. 4º, II) quando cada signatário,
 * além do WhatsApp e do CPF, enviou selfie segurando documento de identidade.
 */
export function fundamentoLegal(avancada: boolean): string {
  return avancada
    ? "As assinaturas acima são assinaturas eletrônicas avançadas, nos termos do art. 4º, II, da Lei 14.063/2020 " +
        "e do art. 10, § 2º, da MP 2.200-2/2001."
    : "As assinaturas acima são assinaturas eletrônicas simples, nos termos do art. 4º, I, da Lei 14.063/2020 " +
        "e do art. 10, § 2º, da MP 2.200-2/2001.";
}

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 56;
const LARGURA_UTIL = A4[0] - 2 * MARGEM;
const ALTURA_BLOCO = 118;
const CINZA = rgb(0.35, 0.35, 0.35);
const AZUL = rgb(0.05, 0.25, 0.55);
const TAMANHO_QR = 92;

export function sha256(dados: Uint8Array): string {
  return createHash("sha256").update(dados).digest("hex");
}

export function formatarDataHora(iso: string, comFuso = true): string {
  const texto = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(iso));
  return comFuso ? `${texto.replace(",", " às")} (horário de Brasília)` : texto.replace(",", "");
}

/**
 * Acrescenta ao fim do PDF uma página de assinaturas com um bloco por signatário.
 * Esta é a versão que cada pessoa lê e assina; os blocos (e as linhas de assinatura
 * achadas no próprio documento) são preenchidos no final.
 */
export async function prepararDocumento(
  original: Uint8Array,
  titulo: string,
  signatarios: SignatarioNaPagina[],
  linhasNoDocumento: LinhaDeAssinatura[] = [],
): Promise<{ pdf: Uint8Array; blocos: Bloco[]; hashOriginal: string }> {
  const hashOriginal = sha256(original);
  const doc = await PDFDocument.load(original);
  const e = await Escritor.criar(doc);
  const blocos: Bloco[] = linhasNoDocumento.map((l) => ({ ...l, origem: "documento" }));

  e.titulo("PÁGINA DE ASSINATURAS");
  e.texto(titulo, 11);
  e.texto(`SHA-256 do documento original: ${hashOriginal}`, 7, CINZA);
  e.texto(
    "As partes abaixo assinam eletronicamente este documento por meio do WhatsApp, nos termos da Lei 14.063/2020 " +
      "e do art. 10, § 2º, da MP 2.200-2/2001. O registro de cada assinatura consta no certificado ao final.",
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
    blocos.push({ signatario: i, pagina: doc.getPageCount() - 1, ...area, origem: "pagina" });
    e.y = topo - ALTURA_BLOCO;
  });

  return { pdf: await doc.save(), blocos, hashOriginal };
}

/**
 * Preenche os carimbos de assinatura, acrescenta o certificado de assinatura eletrônica
 * (com QR Code e linha do tempo) e põe o rodapé de verificação em todas as páginas.
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
    /** Nome de quem enviou (o escritório). */
    remetente: string;
    remetenteTelefone: string;
    urlVerificacao: string;
    registros: RegistroDeAssinatura[];
    /** Assinatura avançada: o envio exigiu selfie com documento de identidade. */
    avancada?: boolean;
    /** Se a via final recebe carimbo do tempo (RFC 3161) depois de assinada. */
    comCarimboDoTempo?: boolean;
    /** Nome no certificado digital que assina o arquivo. */
    certificadoDoArquivo?: string;
  },
): Promise<Uint8Array> {
  const hashApresentado = sha256(apresentado);
  const doc = await PDFDocument.load(apresentado);
  const e = await Escritor.criar(doc, false);

  for (const b of blocos) {
    const r = dados.registros[b.signatario];
    if (r) carimbar(doc.getPage(b.pagina), b, r, e);
  }

  // ------------------------------------------------ certificado
  e.novaPagina();
  const topo = e.y;
  desenharQrCode(e.pagina, dados.urlVerificacao, A4[0] - MARGEM - TAMANHO_QR, topo - TAMANHO_QR);
  e.pagina.drawText("Escaneie para verificar", {
    x: A4[0] - MARGEM - TAMANHO_QR + 6,
    y: topo - TAMANHO_QR - 10,
    size: 7,
    font: e.fonte,
    color: CINZA,
  });
  adicionarLink(doc, e.pagina, [A4[0] - MARGEM - TAMANHO_QR, topo - TAMANHO_QR, A4[0] - MARGEM, topo], dados.urlVerificacao);

  e.reservaDireita = TAMANHO_QR + 16;
  e.titulo("CERTIFICADO DE ASSINATURA ELETRÔNICA");
  e.texto(dados.titulo, 11);
  e.espaco(4);
  e.campo("Código do documento", dados.codigo);
  e.campo("Enviado por", `${dados.remetente} (WhatsApp ${formatarTelefone(dados.remetenteTelefone)})`);
  e.campo("SHA-256 do documento original", dados.hashOriginal);
  e.campo("SHA-256 da versão assinada (com página de assinaturas)", hashApresentado);
  e.y = Math.min(e.y, topo - TAMANHO_QR - 18);
  e.reservaDireita = 0;
  e.texto(`Verifique a autenticidade em: ${dados.urlVerificacao}`, 8, AZUL);
  adicionarLink(doc, e.pagina, [MARGEM, e.y, MARGEM + LARGURA_UTIL, e.y + 12], dados.urlVerificacao);
  e.espaco(8);

  e.titulo("Assinaturas");
  for (const r of dados.registros) {
    const imagem = r.selfie ? await incorporarImagem(doc, r.selfie) : null;
    const alturaFoto = imagem ? Math.min(110, (imagem.height / imagem.width) * 82) : 0;
    e.garantir(Math.max(90, alturaFoto + 24));
    const topo = e.y;
    if (imagem) {
      e.reservaDireita = 100;
      e.pagina.drawImage(imagem, { x: A4[0] - MARGEM - 82, y: topo - alturaFoto, width: 82, height: alturaFoto });
      e.pagina.drawText("Selfie com documento", { x: A4[0] - MARGEM - 82, y: topo - alturaFoto - 9, size: 6.5, font: e.fonte, color: CINZA });
    }
    e.texto(`${r.nome} (${r.papel})`, 10, undefined, true);
    e.campo("CPF", formatarCpf(r.cpf));
    e.campo("WhatsApp", formatarTelefone(r.telefone));
    e.campo("Canal", "WhatsApp (documento recebido e assinado no número do signatário)");
    if (imagem) e.campo("Identidade", "selfie segurando documento de identidade, ao lado");
    e.campo("Data da assinatura", formatarDataHora(r.assinadoEm));
    e.campo("ID da mensagem de confirmação", r.mensagemId);
    if (imagem) e.y = Math.min(e.y, topo - alturaFoto - 14);
    e.reservaDireita = 0;
    e.espaco(6);
  }

  e.espaco(4);
  e.titulo("Eventos do documento");
  e.texto("Datas e horários de Brasília", 7, CINZA);
  for (const ev of linhaDoTempo(dados)) {
    e.garantir(14);
    e.texto(`${formatarDataHora(ev.em, false)}   ${ev.texto}`, 8, undefined, false, 12);
  }

  e.espaco(8);
  e.garantir(110);
  e.titulo("Provas de integridade");
  const avancada = dados.avancada ?? false;
  e.campo(
    "Nível de assinatura",
    avancada ? "Avançada (Lei 14.063/2020, art. 4º, II)" : "Simples (Lei 14.063/2020, art. 4º, I)",
  );
  e.campo(
    "Fatores de autenticação",
    "posse do número de WhatsApp, CPF informado e confirmado na revisão" +
      (avancada ? ", selfie segurando documento de identidade" : ""),
  );
  e.campo("Verificação biométrica", "não realizada");
  e.campo(
    "Assinatura digital do arquivo",
    `${dados.certificadoDoArquivo ? `certificado de ${dados.certificadoDoArquivo}` : "certificado do remetente"}; alterações posteriores invalidam a assinatura`,
  );
  if (dados.comCarimboDoTempo) {
    e.campo("Carimbo do tempo", "RFC 3161 sobre o SHA-256 da via final, verificável na página de verificação");
  }

  e.espaco(8);
  e.garantir(60);
  e.texto("Documento assinado eletronicamente", 9, undefined, true);
  e.texto(fundamentoLegal(avancada), 8, CINZA);
  e.texto(
    "Cada signatário recebeu o documento no próprio WhatsApp, declarou ter lido e concordado, informou o CPF" +
      (avancada ? ", enviou selfie segurando documento de identidade" : "") +
      " e confirmou os dados antes de assinar. Os códigos SHA-256 permitem verificar que o conteúdo não foi alterado.",
    8,
    CINZA,
  );

  rodape(doc, e, dados.codigo, dados.urlVerificacao);
  return doc.save();
}

/** Texto do carimbo, ajustado ao tamanho da área (menor na linha de assinatura do documento). */
function carimbar(pagina: PDFPage, b: Bloco, r: RegistroDeAssinatura, e: Escritor): void {
  const compacto = b.origem === "documento";
  const tamanho = compacto ? 7.5 : 9;
  const linhas = [
    { t: `Assinado eletronicamente por ${r.nome}`, negrito: true },
    { t: `CPF ${formatarCpf(r.cpf)} · WhatsApp ${formatarTelefone(r.telefone)}`, negrito: false },
    { t: `em ${formatarDataHora(r.assinadoEm)}`, negrito: false },
  ];
  linhas.forEach((l, i) => {
    const fonte = l.negrito ? e.negrito : e.fonte;
    const texto = compativel(l.t, fonte);
    const largura = fonte.widthOfTextAtSize(texto, tamanho);
    // Na linha do documento o carimbo fica centralizado, como uma assinatura
    const x = compacto ? b.x + Math.max(0, (b.largura - largura) / 2) : b.x + 4;
    pagina.drawText(texto, {
      x,
      y: b.y + b.altura - tamanho - 3 - i * (tamanho * 1.35),
      size: tamanho,
      font: fonte,
      color: AZUL,
    });
  });
}

type Evento = { em: string; texto: string };

function linhaDoTempo(dados: {
  criadoEm: string;
  remetente: string;
  remetenteTelefone: string;
  registros: RegistroDeAssinatura[];
}): Evento[] {
  const eventos: Evento[] = [
    {
      em: dados.criadoEm,
      texto: `${dados.remetente} (WhatsApp ${formatarTelefone(dados.remetenteTelefone)}) enviou o documento para assinatura`,
    },
  ];
  for (const r of dados.registros) {
    if (r.linkEnviadoEm) eventos.push({ em: r.linkEnviadoEm, texto: `Convite enviado a ${r.nome} (WhatsApp ${formatarTelefone(r.telefone)})` });
    if (r.visualizadoEm) {
      eventos.push({ em: r.visualizadoEm, texto: `${r.nome} abriu o documento no próprio WhatsApp: posse do número verificada` });
    }
    eventos.push({
      em: r.assinadoEm,
      texto: r.selfie
        ? `${r.nome} enviou selfie com documento de identidade, confirmou nome e CPF ${formatarCpf(r.cpf)} na revisão e assinou`
        : `${r.nome} confirmou nome e CPF ${formatarCpf(r.cpf)} na revisão e assinou`,
    });
  }
  const ultima = dados.registros.map((r) => r.assinadoEm).sort().at(-1);
  if (ultima) eventos.push({ em: ultima, texto: "Documento concluído: todas as partes assinaram" });
  return eventos.sort((a, b) => a.em.localeCompare(b.em));
}

/** Faixa no pé de todas as páginas com o código e o endereço de verificação. */
function rodape(doc: PDFDocument, e: Escritor, codigo: string, url: string): void {
  const paginas = doc.getPages();
  paginas.forEach((pagina, i) => {
    const { width } = pagina.getSize();
    pagina.drawRectangle({ x: 0, y: 0, width, height: 24, color: rgb(0.96, 0.97, 0.98), opacity: 0.95 });
    pagina.drawLine({ start: { x: 0, y: 24 }, end: { x: width, y: 24 }, thickness: 0.4, color: rgb(0.8, 0.82, 0.85) });
    const linha1 = compativel(
      `Documento assinado eletronicamente (Lei 14.063/2020 e MP 2.200-2/2001) · Código ${codigo} · Página ${i + 1} de ${paginas.length}`,
      e.fonte,
    );
    const linha2 = compativel(`Verifique a autenticidade em ${url}`, e.fonte);
    for (const [texto, y, cor] of [
      [linha1, 14, CINZA],
      [linha2, 5, AZUL],
    ] as const) {
      const tamanho = Math.min(6.5, ((width - 24) / e.fonte.widthOfTextAtSize(texto, 6.5)) * 6.5);
      const largura = e.fonte.widthOfTextAtSize(texto, tamanho);
      pagina.drawText(texto, { x: (width - largura) / 2, y, size: tamanho, font: e.fonte, color: cor });
      if (texto === linha2) adicionarLink(doc, pagina, [(width - largura) / 2, 3, (width + largura) / 2, 11], url);
    }
  });
}

function desenharQrCode(pagina: PDFPage, texto: string, x: number, y: number): void {
  const { modules } = QRCode.create(texto, { errorCorrectionLevel: "M" });
  const n = modules.size;
  const modulo = TAMANHO_QR / (n + 2); // 1 módulo de margem em cada lado
  pagina.drawRectangle({ x, y, width: TAMANHO_QR, height: TAMANHO_QR, color: rgb(1, 1, 1) });
  for (let linha = 0; linha < n; linha++) {
    for (let coluna = 0; coluna < n; coluna++) {
      if (!modules.get(linha, coluna)) continue;
      pagina.drawRectangle({
        x: x + (coluna + 1) * modulo,
        y: y + TAMANHO_QR - (linha + 2) * modulo,
        width: modulo,
        height: modulo,
        color: rgb(0, 0, 0),
      });
    }
  }
}

async function incorporarImagem(doc: PDFDocument, selfie: { dados: Uint8Array; tipo: string }) {
  try {
    return selfie.tipo.includes("png") ? await doc.embedPng(selfie.dados) : await doc.embedJpg(selfie.dados);
  } catch {
    return null; // imagem corrompida: o certificado sai sem a foto
  }
}

/** Área clicável que abre o endereço (anotação de link do PDF). */
function adicionarLink(doc: PDFDocument, pagina: PDFPage, retangulo: [number, number, number, number], url: string): void {
  const anotacao = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: retangulo,
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    }),
  );
  pagina.node.addAnnot(anotacao);
}

/** Escreve texto em sequência, quebrando linhas e páginas automaticamente. */
class Escritor {
  pagina!: PDFPage;
  y = 0;
  /** Espaço reservado à direita (ex.: ao lado do QR Code). */
  reservaDireita = 0;

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
    const largura = LARGURA_UTIL - recuo - this.reservaDireita;
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
