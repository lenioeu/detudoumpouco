import { createHash } from "node:crypto";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFString, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { formatarCpf } from "../cpf.js";
import { formatarTelefone } from "../telefone.js";
import type { LinhaDeAssinatura } from "./linhas.js";
import {
  COR,
  desenharAdesivo,
  desenharMarcaHorizontal,
  medirAdesivo,
  prepararDesenhosDaMarca,
  retanguloArredondado,
  type DesenhosDaMarca,
} from "./marca-pdf.js";
import { desenharQrCarimbo } from "./qr-carimbo.js";

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
/** Topo do conteúdo, abaixo do cabeçalho com a marca. */
const TOPO_DO_CONTEUDO = A4[1] - 104;
const ALTURA_BLOCO = 150;
/** Diâmetro do carimbo com QR Code no certificado (~3,9 cm: lê com folga impresso ou na tela). */
const TAMANHO_QR = 110;

/** Fontes do design system (Newsreader e IBM Plex Mono), em TTF. Sem elas, o PDF usa Helvetica e Courier. */
export type FontesDaMarca = { texto: Uint8Array; negrito: Uint8Array; italico: Uint8Array; mono: Uint8Array };
let fontesDaMarca: FontesDaMarca | null = null;

/** Define as fontes da marca para os PDFs gerados daqui em diante (o servidor chama ao iniciar). */
export function usarFontesDaMarca(fontes: FontesDaMarca | null): void {
  fontesDaMarca = fontes;
}

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

  e.rotulo("Página de assinaturas");
  e.texto(titulo, 20, COR.grafite, e.negrito);
  e.espaco(2);
  e.texto(`SHA-256 do documento original: ${hashOriginal}`, 6.5, COR.apoio, e.mono);
  e.espaco(4);
  e.texto(
    "As partes abaixo assinam eletronicamente este documento por meio do WhatsApp, nos termos da Lei 14.063/2020 " +
      "e do art. 10, § 2º, da MP 2.200-2/2001. O registro de cada assinatura consta no certificado ao final.",
    9.5,
    COR.apoio,
  );
  e.espaco(12);

  signatarios.forEach((s, i) => {
    e.garantir(ALTURA_BLOCO);
    const topo = e.y;
    const base = topo - ALTURA_BLOCO + 12;
    e.pagina.drawSvgPath(retanguloArredondado(0, 0, LARGURA_UTIL, ALTURA_BLOCO - 12, 10), {
      x: MARGEM,
      y: topo,
      borderColor: COR.borda,
      borderWidth: 0.8,
    });
    e.y -= 16;
    e.texto(s.papel.toUpperCase(), 7, COR.tinta, e.mono, 18);
    e.texto(s.nome, 13, COR.grafite, e.negrito, 18);
    e.texto(`WhatsApp ${formatarTelefone(s.telefone)}`, 8.5, COR.apoio, e.fonte, 18);

    // Linha de assinatura; o adesivo e os dados da assinatura entram acima dela no final
    const area = { x: MARGEM + 18, y: base + 22, largura: LARGURA_UTIL - 36, altura: 46 };
    e.pagina.drawLine({
      start: { x: area.x, y: area.y },
      end: { x: area.x + area.largura, y: area.y },
      thickness: 0.8,
      color: COR.grafite,
    });
    e.pagina.drawText("ASSINATURA ELETRÔNICA", { x: area.x, y: area.y - 11, size: 6.5, font: e.mono, color: COR.apoio });
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
  desenharQrCarimbo(e.pagina, e.desenhos, dados.urlVerificacao, A4[0] - MARGEM - TAMANHO_QR, topo, TAMANHO_QR);
  const legenda = "ESCANEIE PARA VERIFICAR";
  e.pagina.drawText(legenda, {
    x: A4[0] - MARGEM - TAMANHO_QR / 2 - e.mono.widthOfTextAtSize(legenda, 6) / 2,
    y: topo - TAMANHO_QR - 10,
    size: 6,
    font: e.mono,
    color: COR.apoio,
  });
  adicionarLink(doc, e.pagina, [A4[0] - MARGEM - TAMANHO_QR, topo - TAMANHO_QR, A4[0] - MARGEM, topo], dados.urlVerificacao);

  e.reservaDireita = TAMANHO_QR + 20;
  e.rotulo("Certificado de assinatura eletrônica");
  e.texto(dados.titulo, 20, COR.grafite, e.negrito);
  e.espaco(6);
  e.campo("Código do documento", dados.codigo);
  e.campo("Enviado por", `${dados.remetente} (WhatsApp ${formatarTelefone(dados.remetenteTelefone)})`);
  e.campo("SHA-256 do documento original", dados.hashOriginal, true);
  e.campo("SHA-256 da versão assinada (com página de assinaturas)", hashApresentado, true);
  e.y = Math.min(e.y, topo - TAMANHO_QR - 22);
  e.reservaDireita = 0;
  e.campo("Verifique a autenticidade em", dados.urlVerificacao, false, COR.tinta);
  adicionarLink(doc, e.pagina, [MARGEM, e.y, MARGEM + LARGURA_UTIL, e.y + 22], dados.urlVerificacao);

  e.secao("Assinaturas");
  for (const r of dados.registros) {
    const imagem = r.selfie ? await incorporarImagem(doc, r.selfie) : null;
    const alturaFoto = imagem ? Math.min(110, (imagem.height / imagem.width) * 82) : 0;
    e.garantir(Math.max(120, alturaFoto + 30));
    const topo = e.y;
    if (imagem) {
      e.reservaDireita = 100;
      e.pagina.drawImage(imagem, { x: A4[0] - MARGEM - 82, y: topo - alturaFoto, width: 82, height: alturaFoto });
      e.pagina.drawText("SELFIE COM DOCUMENTO", { x: A4[0] - MARGEM - 82, y: topo - alturaFoto - 9, size: 5.5, font: e.mono, color: COR.apoio });
    } else {
      // Sem selfie, o lugar da foto recebe o adesivo de assinatura daquela pessoa
      e.reservaDireita = 150;
      desenharAdesivo(e.pagina, A4[0] - MARGEM - 66, topo - 26, 1, dataDoAdesivo(r.assinadoEm), e);
    }
    e.texto(r.papel.toUpperCase(), 7, COR.tinta, e.mono);
    e.texto(r.nome, 12, COR.grafite, e.negrito);
    e.espaco(2);
    e.parDeCampos(["CPF", formatarCpf(r.cpf)], ["WhatsApp", formatarTelefone(r.telefone)]);
    e.parDeCampos(["Data da assinatura", formatarDataHora(r.assinadoEm)], ["ID da mensagem de confirmação", r.mensagemId, true]);
    e.campo("Canal", "WhatsApp (documento recebido e assinado no número do signatário)");
    if (imagem) e.campo("Identidade", "selfie segurando documento de identidade, ao lado");
    if (imagem) e.y = Math.min(e.y, topo - alturaFoto - 16);
    e.reservaDireita = 0;
    e.espaco(10);
  }

  e.secao("Eventos do documento");
  e.texto("DATAS E HORÁRIOS DE BRASÍLIA", 6.5, COR.apoio, e.mono);
  e.espaco(4);
  for (const ev of linhaDoTempo(dados)) {
    e.garantir(16);
    const y = e.y;
    e.pagina.drawText(formatarDataHora(ev.em, false), { x: MARGEM, y: y - 8, size: 7, font: e.mono, color: COR.tinta });
    e.texto(ev.texto, 9, COR.grafite, e.fonte, 96);
    e.espaco(3);
  }

  e.secao("Provas de integridade");
  e.garantir(140);
  const avancada = dados.avancada ?? false;
  e.campo("Nível de assinatura", avancada ? "Avançada (Lei 14.063/2020, art. 4º, II)" : "Simples (Lei 14.063/2020, art. 4º, I)");
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

  e.espaco(10);
  e.garantir(70);
  e.texto("Documento assinado eletronicamente", 11, COR.grafite, e.negrito);
  e.espaco(2);
  e.texto(fundamentoLegal(avancada), 9, COR.apoio);
  e.texto(
    "Cada signatário recebeu o documento no próprio WhatsApp, declarou ter lido e concordado, informou o CPF" +
      (avancada ? ", enviou selfie segurando documento de identidade" : "") +
      " e confirmou os dados antes de assinar. Os códigos SHA-256 permitem verificar que o conteúdo não foi alterado.",
    9,
    COR.apoio,
  );

  rodape(doc, e, dados.codigo, dados.urlVerificacao);
  return doc.save();
}

/** Data e hora curtas do adesivo, como no design system: "10/11/2026 14:32 · via WhatsApp". */
function dataDoAdesivo(iso: string): string {
  return `${formatarDataHora(iso, false).slice(0, 16)} · via WhatsApp`;
}

/**
 * Assinatura de uma pessoa: o adesivo do design system (mini carimbo, "de acordo", data) e, ao lado,
 * nome, CPF completo, WhatsApp e data e hora. Na linha de assinatura do próprio documento sai menor.
 */
function carimbar(pagina: PDFPage, b: Bloco, r: RegistroDeAssinatura, e: Escritor): void {
  const compacto = b.origem === "documento";
  const escala = compacto ? 0.7 : 1;
  const data = dataDoAdesivo(r.assinadoEm);
  const { largura, altura } = medirAdesivo(data, e);
  const adesivoL = largura * escala;
  desenharAdesivo(pagina, b.x + adesivoL / 2 + 2, b.y + (altura * escala) / 2 + (compacto ? 2 : 6), escala, data, e);

  const x = b.x + adesivoL + (compacto ? 10 : 18);
  const disponivel = b.x + b.largura - x;
  const linhas = [
    { t: `Assinado eletronicamente por ${r.nome}`, fonte: e.negrito, tamanho: compacto ? 7.5 : 10, cor: COR.grafite },
    { t: `CPF ${formatarCpf(r.cpf)} · WhatsApp ${formatarTelefone(r.telefone)}`, fonte: e.fonte, tamanho: compacto ? 7 : 9, cor: COR.apoio },
    { t: `em ${formatarDataHora(r.assinadoEm)}`, fonte: e.fonte, tamanho: compacto ? 7 : 9, cor: COR.apoio },
  ];
  let y = b.y + (compacto ? b.altura - 8 : b.altura - 10);
  for (const l of linhas) {
    const texto = compativel(l.t, l.fonte);
    // Encolhe a linha se o nome for longo demais para o espaço ao lado do adesivo
    const tamanho = Math.min(l.tamanho, (disponivel / l.fonte.widthOfTextAtSize(texto, l.tamanho)) * l.tamanho);
    pagina.drawText(texto, { x, y, size: tamanho, font: l.fonte, color: l.cor });
    y -= l.tamanho * (compacto ? 1.35 : 1.5);
  }
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

/** Faixa no pé de todas as páginas com o código e o endereço de verificação, nas cores da marca. */
function rodape(doc: PDFDocument, e: Escritor, codigo: string, url: string): void {
  const paginas = doc.getPages();
  paginas.forEach((pagina, i) => {
    const { width } = pagina.getSize();
    pagina.drawRectangle({ x: 0, y: 0, width, height: 26, color: COR.papelQuente, opacity: 0.96 });
    pagina.drawLine({ start: { x: 0, y: 26 }, end: { x: width, y: 26 }, thickness: 0.5, color: COR.borda });
    const linha1 = compativel(
      `DeAcordo · Documento assinado eletronicamente (Lei 14.063/2020 e MP 2.200-2/2001) · Código ${codigo} · Página ${i + 1} de ${paginas.length}`,
      e.fonte,
    );
    const linha2 = compativel(`Verifique a autenticidade em ${url}`, e.mono);
    for (const [texto, y, cor, fonte, maximo] of [
      [linha1, 15, COR.apoio, e.fonte, 7],
      [linha2, 6, COR.tinta, e.mono, 6.2],
    ] as const) {
      const tamanho = Math.min(maximo, ((width - 24) / fonte.widthOfTextAtSize(texto, maximo)) * maximo);
      const largura = fonte.widthOfTextAtSize(texto, tamanho);
      pagina.drawText(texto, { x: (width - largura) / 2, y, size: tamanho, font: fonte, color: cor });
      if (texto === linha2) adicionarLink(doc, pagina, [(width - largura) / 2, 4, (width + largura) / 2, 12], url);
    }
  });
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

/** Escreve texto em sequência, quebrando linhas e páginas automaticamente; cada página nova leva a marca no topo. */
class Escritor {
  pagina!: PDFPage;
  y = 0;
  /** Espaço reservado à direita (ex.: ao lado do QR Code). */
  reservaDireita = 0;

  private constructor(
    private readonly doc: PDFDocument,
    readonly fonte: PDFFont,
    readonly negrito: PDFFont,
    readonly italico: PDFFont,
    readonly mono: PDFFont,
    readonly desenhos: DesenhosDaMarca,
  ) {}

  static async criar(doc: PDFDocument, abrirPagina = true): Promise<Escritor> {
    let fontes: [PDFFont, PDFFont, PDFFont, PDFFont];
    if (fontesDaMarca) {
      doc.registerFontkit(fontkit);
      const f = fontesDaMarca;
      fontes = await Promise.all([
        doc.embedFont(f.texto, { subset: true }),
        doc.embedFont(f.negrito, { subset: true }),
        doc.embedFont(f.italico, { subset: true }),
        doc.embedFont(f.mono, { subset: true }),
      ]);
    } else {
      fontes = await Promise.all([
        doc.embedFont(StandardFonts.Helvetica),
        doc.embedFont(StandardFonts.HelveticaBold),
        doc.embedFont(StandardFonts.HelveticaBoldOblique),
        doc.embedFont(StandardFonts.Courier),
      ]);
    }
    const e = new Escritor(doc, ...fontes, prepararDesenhosDaMarca(doc));
    if (abrirPagina) e.novaPagina();
    return e;
  }

  novaPagina(): void {
    this.pagina = this.doc.addPage(A4);
    // Cabeçalho: marca horizontal à esquerda, o endereço à direita e um fio embaixo
    desenharMarcaHorizontal(this.pagina, this.desenhos, MARGEM, A4[1] - 40, 30);
    const nome = "DEACORDO.APP";
    this.pagina.drawText(nome, {
      x: A4[0] - MARGEM - this.mono.widthOfTextAtSize(nome, 7),
      y: A4[1] - 58,
      size: 7,
      font: this.mono,
      color: COR.apoio,
    });
    this.pagina.drawLine({ start: { x: MARGEM, y: A4[1] - 80 }, end: { x: A4[0] - MARGEM, y: A4[1] - 80 }, thickness: 0.6, color: COR.borda });
    this.y = TOPO_DO_CONTEUDO;
  }

  garantir(altura: number): void {
    if (this.y - altura < MARGEM) this.novaPagina();
  }

  espaco(pontos: number): void {
    this.y -= pontos;
  }

  /** Rótulo em maiúsculas, mono, na cor tinta (como os rótulos do site). */
  rotulo(t: string): void {
    this.texto(t.toUpperCase(), 7.5, COR.tinta, this.mono);
    this.espaco(2);
  }

  /** Título de seção com um fio embaixo. */
  secao(t: string): void {
    this.espaco(10);
    this.garantir(60);
    this.texto(t, 14, COR.grafite, this.negrito);
    this.pagina.drawLine({ start: { x: MARGEM, y: this.y + 1 }, end: { x: A4[0] - MARGEM, y: this.y + 1 }, thickness: 0.5, color: COR.borda });
    this.espaco(8);
  }

  /** Rótulo pequeno em cima e o valor embaixo; hashes e IDs saem em fonte mono. */
  campo(rotulo: string, valor: string, mono = false, cor: RGB = COR.grafite, recuo = 0): void {
    this.garantir(24);
    this.texto(rotulo.toUpperCase(), 6, COR.apoio, this.mono, recuo);
    this.texto(valor, mono ? 7.5 : 9.5, cor, mono ? this.mono : this.fonte, recuo);
    this.espaco(3);
  }

  /** Dois campos lado a lado, cada um com metade da largura disponível. */
  parDeCampos(esquerda: [string, string, boolean?], direita: [string, string, boolean?]): void {
    this.garantir(30);
    const topo = this.y;
    const reserva = this.reservaDireita;
    const metade = (LARGURA_UTIL - reserva) / 2;
    this.reservaDireita = reserva + metade + 8;
    this.campo(esquerda[0], esquerda[1], esquerda[2]);
    const fimEsquerda = this.y;
    this.y = topo;
    this.reservaDireita = reserva;
    this.campo(direita[0], direita[1], direita[2], COR.grafite, metade);
    this.y = Math.min(this.y, fimEsquerda);
  }

  texto(t: string, tamanho: number, cor: RGB = COR.grafite, fonte: PDFFont = this.fonte, recuo = 0): void {
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
