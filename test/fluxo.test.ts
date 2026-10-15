import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it } from "vitest";
import { Banco } from "../src/banco.js";
import { carregarConfig } from "../src/config.js";
import { Fluxo } from "../src/conversa/fluxo.js";
import type { Analise } from "../src/ia/partes.js";
import { ErroWhatsApp } from "../src/whatsapp/cliente.js";
import type { MensagemRecebida } from "../src/whatsapp/webhook.js";

const ESCRITORIO = "5551911112222";
const config = carregarConfig({
  PUBLIC_URL: "https://bot.exemplo.com.br",
  DATABASE_PATH: ":memory:",
  AUTHORIZED_SENDERS: ESCRITORIO,
  SENDER_DISPLAY_NAME: "Escritório Teste",
  WHATSAPP_TOKEN: "t",
  WHATSAPP_PHONE_NUMBER_ID: "1",
  WHATSAPP_APP_SECRET: "s",
  WHATSAPP_VERIFY_TOKEN: "v",
  DOCUMENSO_URL: "https://assinar.exemplo.com.br",
  DOCUMENSO_API_TOKEN: "d",
  DOCUMENSO_WEBHOOK_SECRET: "w",
});

const analise: Analise = {
  titulo: "Procuração ad judicia",
  tipo_documento: "procuração",
  partes: [
    { papel: "outorgante", nome: "Maria da Silva" },
    { papel: "outorgado", nome: null },
  ],
  ordem: "sequencial",
  observacao: null,
};

type Chamada = { metodo: string; para: string; args: unknown[] };

class WhatsAppFalso {
  chamadas: Chamada[] = [];
  janelaFechada = false;
  private n = 0;
  async enviarTexto(para: string, texto: string) {
    if (this.janelaFechada && para === ESCRITORIO) throw new ErroWhatsApp("fora da janela", 400, 131047);
    return this.registrar("texto", para, texto);
  }
  async enviarBotoes(para: string, texto: string, botoes: unknown[]) {
    return this.registrar("botoes", para, texto, botoes);
  }
  async enviarDocumento(para: string, _pdf: Uint8Array, nome: string) {
    return this.registrar("documento", para, nome);
  }
  async enviarTemplate(para: string, nome: string, params: string[], sufixo?: string) {
    return this.registrar("template", para, nome, params, sufixo);
  }
  async baixarMidia() {
    const doc = await PDFDocument.create();
    doc.addPage();
    return doc.save();
  }
  ultima(para: string) {
    return this.chamadas.filter((c) => c.para === para).at(-1);
  }
  private registrar(metodo: string, para: string, ...args: unknown[]) {
    this.chamadas.push({ metodo, para, args });
    return `wamid.${++this.n}`;
  }
}

describe("conversa completa", () => {
  let banco: Banco;
  let whatsapp: WhatsAppFalso;
  let fluxo: Fluxo;
  let enviado: { ordem: string; signatarios: { nome: string; email: string }[]; campos: unknown[] } | null;
  let id = 0;

  const msg = (m: Record<string, unknown>) => fluxo.receberMensagem({ de: ESCRITORIO, id: `in${++id}`, ...m } as MensagemRecebida);

  beforeEach(() => {
    banco = new Banco(":memory:");
    whatsapp = new WhatsAppFalso();
    enviado = null;
    fluxo = new Fluxo(
      config,
      banco,
      whatsapp,
      {
        analisar: async () => analise,
        corrigir: async (_pdf, anterior) => ({ ...anterior, partes: [anterior.partes[0]!, { papel: "outorgado", nome: "João Pereira" }] }),
      },
      {
        criarEEnviar: async (e) => {
          enviado = e;
          return {
            documentoId: 42,
            signatarios: e.signatarios.map((s, i) => ({
              recipientId: 100 + i,
              email: s.email,
              token: `tok${i}`,
              signingUrl: `https://assinar.exemplo.com.br/sign/tok${i}`,
            })),
          };
        },
        baixarAssinado: async () => new Uint8Array([1, 2, 3]),
      },
    );
  });

  it("do PDF até a última assinatura", async () => {
    await msg({ tipo: "documento", mediaId: "m", mimeType: "application/pdf", nomeArquivo: "procuracao.pdf" });
    expect(whatsapp.ultima(ESCRITORIO)).toMatchObject({ metodo: "botoes" });
    expect(String(whatsapp.ultima(ESCRITORIO)!.args[0])).toContain("Maria da Silva");

    // correção em texto livre
    await msg({ tipo: "texto", texto: "o outorgado é João Pereira" });
    expect(String(whatsapp.ultima(ESCRITORIO)!.args[0])).toContain("João Pereira");

    await msg({ tipo: "botao", botaoId: "partes_ok" });
    expect(String(whatsapp.ultima(ESCRITORIO)!.args[0])).toContain("Contato 1 de 2");

    // número inválido é recusado sem avançar
    await msg({ tipo: "texto", texto: "não sei" });
    expect(whatsapp.ultima(ESCRITORIO)!.metodo).toBe("texto");
    await msg({ tipo: "texto", texto: "51 98888-7777" });
    await msg({ tipo: "contato", contatos: [{ nome: "Joãozinho", telefones: ["5551977776666"] }] });
    expect(String(whatsapp.ultima(ESCRITORIO)!.args[0])).toContain("Posso enviar?");

    await msg({ tipo: "botao", botaoId: "enviar" });
    expect(enviado).toMatchObject({
      ordem: "sequencial",
      signatarios: [
        { nome: "Maria da Silva", email: "5551988887777@whatsapp.invalid" },
        { nome: "João Pereira", email: "5551977776666@whatsapp.invalid" },
      ],
    });
    expect(enviado!.campos).toHaveLength(4);

    // sequencial: só a primeira recebe o link agora
    const links = () => whatsapp.chamadas.filter((c) => c.metodo === "template" && c.args[0] === "solicitacao_assinatura");
    expect(links().map((c) => [c.para, c.args[2]])).toEqual([["5551988887777", "tok0"]]);
    expect(links()[0]!.args[1]).toEqual(["Maria", "Escritório Teste", "Procuração ad judicia"]);

    // Maria assina -> João recebe o link e o escritório é avisado
    const recipients = (m: string, j: string) => [
      { id: 100, name: "Maria", signingStatus: m, signedAt: m === "SIGNED" ? "2026-10-15T12:00:00Z" : null, rejectionReason: null },
      { id: 101, name: "João", signingStatus: j, signedAt: j === "SIGNED" ? "2026-10-15T13:00:00Z" : null, rejectionReason: null },
    ];
    await fluxo.receberEventoDocumenso({ event: "DOCUMENT_RECIPIENT_COMPLETED", payload: { id: 42, recipients: recipients("SIGNED", "NOT_SIGNED") as never } });
    expect(links().map((c) => c.para)).toEqual(["5551988887777", "5551977776666"]);
    expect(String(whatsapp.ultima(ESCRITORIO)!.args[0])).toContain("Maria da Silva* (outorgante) assinou");

    // evento repetido não reenvia nada
    const total = whatsapp.chamadas.length;
    await fluxo.receberEventoDocumenso({ event: "DOCUMENT_RECIPIENT_COMPLETED", payload: { id: 42, recipients: recipients("SIGNED", "NOT_SIGNED") as never } });
    expect(whatsapp.chamadas.length).toBe(total);

    // João assina -> documento concluído, PDF vai para o escritório
    await fluxo.receberEventoDocumenso({ event: "DOCUMENT_COMPLETED", payload: { id: 42, recipients: recipients("SIGNED", "SIGNED") as never } });
    expect(whatsapp.ultima(ESCRITORIO)).toMatchObject({ metodo: "documento", args: ["Procuração ad judicia - assinado.pdf"] });
  });

  it("guarda o aviso quando a janela de 24h fechou e entrega na próxima mensagem", async () => {
    await msg({ tipo: "documento", mediaId: "m", mimeType: "application/pdf", nomeArquivo: "p.pdf" });
    await msg({ tipo: "texto", texto: "o outorgado é João Pereira" });
    await msg({ tipo: "botao", botaoId: "partes_ok" });
    await msg({ tipo: "botao", botaoId: "eu_assino" });
    await msg({ tipo: "texto", texto: "51 97777-6666" });
    await msg({ tipo: "botao", botaoId: "enviar" });

    whatsapp.janelaFechada = true;
    await fluxo.receberEventoDocumenso({
      event: "DOCUMENT_COMPLETED",
      payload: {
        id: 42,
        recipients: [
          { id: 100, name: "a", signingStatus: "SIGNED", signedAt: "2026-10-15T12:00:00Z", rejectionReason: null },
          { id: 101, name: "b", signingStatus: "SIGNED", signedAt: "2026-10-15T12:00:00Z", rejectionReason: null },
        ],
      },
    });
    expect(whatsapp.ultima(ESCRITORIO)).toMatchObject({ metodo: "template", args: ["aviso_assinatura", expect.any(Array), undefined] });
    expect(banco.pendencias(ESCRITORIO)).toHaveLength(1);

    whatsapp.janelaFechada = false;
    await msg({ tipo: "texto", texto: "oi" });
    expect(banco.pendencias(ESCRITORIO)).toHaveLength(0);
    expect(whatsapp.chamadas.some((c) => c.metodo === "documento" && c.para === ESCRITORIO)).toBe(true);
  });

  it("não aceita documentos de números não autorizados", async () => {
    await fluxo.receberMensagem({ de: "5511900000000", id: "x1", tipo: "documento", mediaId: "m", mimeType: "application/pdf", nomeArquivo: "a.pdf" });
    expect(whatsapp.ultima("5511900000000")).toMatchObject({ metodo: "texto" });
    expect(String(whatsapp.ultima("5511900000000")!.args[0])).toContain("apenas para envio");
  });

  it("ignora mensagem repetida pela Meta", async () => {
    await fluxo.receberMensagem({ de: ESCRITORIO, id: "dup", tipo: "texto", texto: "oi" });
    await fluxo.receberMensagem({ de: ESCRITORIO, id: "dup", tipo: "texto", texto: "oi" });
    expect(whatsapp.chamadas).toHaveLength(1);
  });
});
