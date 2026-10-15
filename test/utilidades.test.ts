import { createHmac } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { linhasComTelefone, parteDoAdvogado, parteDoNome } from "../src/conversa/fluxo.js";
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
  const partes = [
    { papel: "outorgante", nome: "Carlos Henrique Nunes da Costa" },
    { papel: "outorgado", nome: "Maria Heloísa Pereira Canali" },
    { papel: "testemunha", nome: null },
  ];

  it("lê várias linhas com nome e telefone", () => {
    expect(linhasComTelefone("Carlos Henrique 21 98577-8890\nHeloísa: (27) 99616-8491")).toEqual([
      { nome: "Carlos Henrique", telefone: "5521985778890" },
      { nome: "Heloísa", telefone: "5527996168491" },
    ]);
    expect(linhasComTelefone("só o Carlos assina")).toEqual([]);
  });

  it("acha a parte pelo nome, mesmo abreviado ou sem acento", () => {
    expect(parteDoNome(partes, [0, 1], "CARLOS HENRIQUE")).toBe(0);
    expect(parteDoNome(partes, [0, 1], "heloisa canali")).toBe(1);
    expect(parteDoNome(partes, [0, 1], "Fulano")).toBeNull();
  });

  it("reconhece o advogado só quando todas as palavras do nome dele batem", () => {
    const comAdvogado = [...partes, { papel: "outorgado", nome: "LENIO FILGUEIRAS GOULARTE FILHO" }];
    expect(parteDoAdvogado(comAdvogado, "Lenio Goularte")).toBe(3);
    expect(parteDoAdvogado(comAdvogado, "Lenio Silva")).toBeNull();
    expect(parteDoAdvogado(comAdvogado, "Lenio")).toBeNull();
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
