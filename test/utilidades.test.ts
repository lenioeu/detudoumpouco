import { createHmac } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { contatoDoCartao, contatoDoTexto } from "../src/conversa/fluxo.js";
import { lerBotao } from "../src/conversa/signatario.js";
import { mascararCpf, validarCpf } from "../src/cpf.js";
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

  it("lê cartão de contato", () => {
    expect(contatoDoCartao(semNome, [{ nome: "Ana Souza", telefones: ["5551977776666"] }])).toEqual({
      papel: "outorgado",
      nome: "Ana Souza",
      telefone: "5551977776666",
    });
  });
});

describe("CPF", () => {
  it.each(["529.982.247-25", "52998224725", "111.444.777-35"])("aceita %s", (cpf) => {
    expect(validarCpf(cpf)).toMatch(/^\d{11}$/);
  });

  it.each(["529.982.247-24", "111.111.111-11", "123", "5299822472a"])("recusa %s", (cpf) => {
    expect(validarCpf(cpf)).toBeNull();
  });

  it("mascara para exibição", () => {
    expect(mascararCpf("52998224725")).toBe("***.982.247-**");
  });
});

describe("botões de assinatura", () => {
  it("lê o id do botão", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(lerBotao(`assinar:${id}:2`)).toEqual({ acao: "assinar", envioId: id, indice: 2 });
    expect(lerBotao(`apagar:${id}:2`)).toBeNull();
    expect(lerBotao("enviar")).toBeNull();
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

describe("IA de demonstração do simulador", () => {
  it("lê as partes escritas na correção", async () => {
    const { IaDeDemonstracao } = await import("../src/simulador/ia-demonstracao.js");
    const ia = new IaDeDemonstracao();
    const corrigida = await ia.corrigir(new Uint8Array(), await ia.analisar(), "outorgante: Maria da Silva; outorgado: João Pereira");
    expect(corrigida.partes).toEqual([
      { papel: "outorgante", nome: "Maria da Silva" },
      { papel: "outorgado", nome: "João Pereira" },
    ]);
    expect(corrigida.observacao).toBeNull();
  });
});
