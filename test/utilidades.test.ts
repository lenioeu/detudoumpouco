import { createHmac } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { acrescentarPaginaDeAssinaturas } from "../src/assinatura/pagina.js";
import { contatoDoCartao, contatoDoTexto, emailsUnicos } from "../src/conversa/fluxo.js";
import { formatarTelefone, normalizarTelefone } from "../src/telefone.js";
import { assinaturaValida, extrairEventos } from "../src/whatsapp/webhook.js";

describe("telefone", () => {
  it.each([
    ["(51) 99999-8888", "5551999998888"],
    ["+55 51 99999-8888", "5551999998888"],
    ["051 99999 8888", "5551999998888"],
    ["51 3333-4444", "555133334444"],
    ["5551999998888", "5551999998888"],
  ])("normaliza %s", (entrada, esperado) => {
    expect(normalizarTelefone(entrada)).toBe(esperado);
  });

  it("rejeita números curtos demais", () => {
    expect(normalizarTelefone("99999")).toBeNull();
  });

  it("formata para exibição", () => {
    expect(formatarTelefone("5551999998888")).toBe("+55 (51) 99999-8888");
  });
});

describe("contatos", () => {
  const semNome = { papel: "outorgado", nome: null };
  const comNome = { papel: "outorgante", nome: "Maria da Silva" };

  it("usa o nome do documento e o telefone digitado", () => {
    expect(contatoDoTexto(comNome, "51 99999-8888")).toEqual({
      papel: "outorgante",
      nome: "Maria da Silva",
      telefone: "5551999998888",
    });
  });

  it("pega o nome digitado quando o documento está em branco", () => {
    expect(contatoDoTexto(semNome, "João Pereira, (51) 98888-7777")).toEqual({
      papel: "outorgado",
      nome: "João Pereira",
      telefone: "5551988887777",
    });
  });

  it("pede o nome quando falta", () => {
    expect(typeof contatoDoTexto(semNome, "51 98888-7777")).toBe("string");
  });

  it("lê cartão de contato com e-mail", () => {
    expect(contatoDoCartao(semNome, [{ nome: "Ana Souza", telefones: ["5551977776666"], email: "ana@ex.com" }])).toEqual({
      papel: "outorgado",
      nome: "Ana Souza",
      telefone: "5551977776666",
      email: "ana@ex.com",
    });
  });

  it("gera e-mails únicos para o Documenso", () => {
    const c = { papel: "p", nome: "n", telefone: "5551999998888" };
    expect(emailsUnicos([c, c, { ...c, email: "X@Ex.com" }], "whatsapp.invalid")).toEqual([
      "5551999998888@whatsapp.invalid",
      "5551999998888+2@whatsapp.invalid",
      "x@ex.com",
    ]);
  });
});

describe("webhook do WhatsApp", () => {
  it("confere a assinatura HMAC da Meta", () => {
    const corpo = Buffer.from('{"a":1}');
    const assinatura = "sha256=" + createHmac("sha256", "segredo").update(corpo).digest("hex");
    expect(assinaturaValida(corpo, assinatura, "segredo")).toBe(true);
    expect(assinaturaValida(corpo, assinatura, "outro")).toBe(false);
    expect(assinaturaValida(corpo, undefined, "segredo")).toBe(false);
  });

  it("extrai mensagens e status", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: "5551", id: "m1", type: "text", text: { body: "oi" } },
                  { from: "5551", id: "m2", type: "document", document: { id: "d1", mime_type: "application/pdf", filename: "a.pdf" } },
                  { from: "5551", id: "m3", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "enviar" } } },
                  {
                    from: "5551",
                    id: "m4",
                    type: "contacts",
                    contacts: [{ name: { formatted_name: "Ana" }, phones: [{ phone: "+55 51 97777-6666", wa_id: "5551977776666" }] }],
                  },
                ],
                statuses: [{ id: "w1", status: "delivered", recipient_id: "5552", timestamp: "1" }],
              },
            },
          ],
        },
      ],
    };
    const { mensagens, status } = extrairEventos(payload);
    expect(mensagens.map((m) => m.tipo)).toEqual(["texto", "documento", "botao", "contato"]);
    expect(mensagens[3]).toMatchObject({ contatos: [{ nome: "Ana", telefones: ["5551977776666"] }] });
    expect(status).toEqual([{ mensagemId: "w1", status: "delivered", destinatario: "5552", timestamp: "1" }]);
  });
});

describe("página de assinaturas", () => {
  it("acrescenta páginas e posiciona os campos dentro delas", async () => {
    const original = await PDFDocument.create();
    original.addPage();
    const bytes = await original.save();

    const signatarios = Array.from({ length: 6 }, (_, i) => ({
      papel: "parte",
      nome: `Pessoa ${i + 1} — São João`,
      telefone: "5551999998888",
    }));
    const { pdf, campos, hashOriginal } = await acrescentarPaginaDeAssinaturas(bytes, "Contrato de Honorários", signatarios);

    const resultado = await PDFDocument.load(pdf);
    expect(resultado.getPageCount()).toBe(3); // original + 2 páginas (5 blocos por página)
    expect(hashOriginal).toMatch(/^[0-9a-f]{64}$/);
    expect(campos).toHaveLength(12);
    expect(campos.filter((c) => c.pagina === 2)).toHaveLength(10);
    expect(campos.filter((c) => c.pagina === 3)).toHaveLength(2);
    for (const c of campos) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.largura).toBeLessThanOrEqual(100);
      expect(c.y + c.altura).toBeLessThanOrEqual(100);
    }
  });
});
