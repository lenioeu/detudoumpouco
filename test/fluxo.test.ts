import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it } from "vitest";
import { Banco } from "../src/banco.js";
import { carregarConfig } from "../src/config.js";
import { Avisador, Filas } from "../src/conversa/avisos.js";
import { Fluxo } from "../src/conversa/fluxo.js";
import { ColetaDeAssinaturas, lerBotao } from "../src/conversa/signatario.js";
import type { Analise } from "../src/ia/partes.js";
import { ErroWhatsApp } from "../src/whatsapp/cliente.js";
import { paginaDeVerificacao } from "../src/verificacao.js";
import type { MensagemRecebida } from "../src/whatsapp/webhook.js";

const ESCRITORIO = "5551911112222";
const MARIA = "5551988887777";
const JOAO = "5551977776666";
const CPF_MARIA = "529.982.247-25";
const CPF_JOAO = "11144477735";

const config = carregarConfig({
  PUBLIC_URL: "https://bot.exemplo.com.br",
  DATABASE_PATH: ":memory:",
  AUTHORIZED_SENDERS: ESCRITORIO,
  SENDER_DISPLAY_NAME: "Escritório Teste",
  WHATSAPP_TOKEN: "t",
  WHATSAPP_PHONE_NUMBER_ID: "1",
  WHATSAPP_APP_SECRET: "s",
  WHATSAPP_VERIFY_TOKEN: "v",
  CERTIFICATE_PASSWORD: "senha-de-teste",
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
  /** Telefones fora da janela de 24h (só aceitam template). */
  janelaFechada = new Set<string>();
  private n = 0;
  async enviarTexto(para: string, texto: string) {
    this.checarJanela(para);
    return this.registrar("texto", para, texto);
  }
  async enviarBotoes(para: string, texto: string, botoes: { id: string; titulo: string }[]) {
    this.checarJanela(para);
    return this.registrar("botoes", para, texto, botoes);
  }
  async enviarDocumento(para: string, _pdf: Uint8Array, nome: string) {
    this.checarJanela(para);
    return this.registrar("documento", para, nome);
  }
  async enviarTemplate(para: string, nome: string, params: string[], payload?: string) {
    return this.registrar("template", para, nome, params, payload);
  }
  async baixarMidia() {
    const doc = await PDFDocument.create();
    doc.addPage();
    return doc.save();
  }
  ultima(para: string) {
    return this.chamadas.filter((c) => c.para === para).at(-1)!;
  }
  ultimoTexto(para: string) {
    return String(this.ultima(para).args[0]);
  }
  /** Id do botão com o título informado na última mensagem com botões para o telefone. */
  botao(para: string, titulo: string) {
    const c = this.chamadas.filter((x) => x.para === para && x.metodo === "botoes").at(-1)!;
    return (c.args[1] as { id: string; titulo: string }[]).find((b) => b.titulo === titulo)!.id;
  }
  convites() {
    return this.chamadas.filter((c) => c.metodo === "template" && c.args[0] === "solicitacao_assinatura");
  }
  private checarJanela(para: string) {
    if (this.janelaFechada.has(para)) throw new ErroWhatsApp("fora da janela", 400, 131047);
  }
  private registrar(metodo: string, para: string, ...args: unknown[]) {
    this.chamadas.push({ metodo, para, args });
    return `wamid.${++this.n}`;
  }
}

describe("assinatura pelo WhatsApp", () => {
  let banco: Banco;
  let whatsapp: WhatsAppFalso;
  let fluxo: Fluxo;
  let assinados: Uint8Array[];
  let id = 0;

  const de = (telefone: string, m: Record<string, unknown>) =>
    fluxo.receberMensagem({ de: telefone, id: `in${++id}`, ...m } as MensagemRecebida);
  const doEscritorio = (m: Record<string, unknown>) => de(ESCRITORIO, m);

  beforeEach(() => {
    banco = new Banco(":memory:");
    whatsapp = new WhatsAppFalso();
    assinados = [];
    const filas = new Filas();
    const avisos = new Avisador(config, banco, whatsapp);
    const assinador = {
      assinar: async (pdf: Uint8Array) => {
        assinados.push(pdf);
        return pdf;
      },
    };
    const coleta = new ColetaDeAssinaturas(config, banco, whatsapp, avisos, assinador, filas);
    const ia = {
      analisar: async () => analise,
      corrigir: async (_pdf: Uint8Array, anterior: Analise) => ({
        ...anterior,
        partes: [anterior.partes[0]!, { papel: "outorgado", nome: "João Pereira" }],
      }),
    };
    fluxo = new Fluxo(config, banco, whatsapp, ia, coleta, avisos, filas);
  });

  /** Escritório manda o PDF, corrige o outorgado, informa os contatos e confirma o envio. */
  async function enviarProcuracao() {
    await doEscritorio({ tipo: "documento", mediaId: "m", mimeType: "application/pdf", nomeArquivo: "procuracao.pdf" });
    expect(whatsapp.ultimoTexto(ESCRITORIO)).toContain("Maria da Silva");
    await doEscritorio({ tipo: "texto", texto: "o outorgado é João Pereira" });
    expect(whatsapp.ultimoTexto(ESCRITORIO)).toContain("João Pereira");
    await doEscritorio({ tipo: "botao", botaoId: "partes_ok" });
    expect(whatsapp.ultimoTexto(ESCRITORIO)).toContain("Contato 1 de 2");
    await doEscritorio({ tipo: "texto", texto: "não sei" }); // inválido: pede de novo
    await doEscritorio({ tipo: "texto", texto: "51 98888-7777" });
    await doEscritorio({ tipo: "contato", contatos: [{ nome: "Joãozinho", telefones: [JOAO] }] });
    expect(whatsapp.ultimoTexto(ESCRITORIO)).toContain("Posso enviar?");
    await doEscritorio({ tipo: "botao", botaoId: "enviar" });
  }

  /** Pessoa toca em "Ver documento", depois em "Assinar" e digita o CPF. */
  async function assinar(telefone: string, cpf: string) {
    const convite = whatsapp.convites().filter((c) => c.para === telefone).at(-1)!;
    await de(telefone, { tipo: "botao", botaoId: convite.args[2] });
    expect(whatsapp.chamadas.some((c) => c.para === telefone && c.metodo === "documento")).toBe(true);
    await de(telefone, { tipo: "botao", botaoId: whatsapp.botao(telefone, "Assinar") });
    expect(whatsapp.ultimoTexto(telefone)).toContain("CPF");
    await de(telefone, { tipo: "texto", texto: cpf });
  }

  it("do PDF até a via final, em ordem", async () => {
    await enviarProcuracao();

    // sequencial: só a Maria recebe o convite agora
    expect(whatsapp.convites().map((c) => c.para)).toEqual([MARIA]);
    expect(whatsapp.convites()[0]!.args[1]).toEqual(["Maria", "Escritório Teste", "Procuração ad judicia"]);

    // CPF inválido não assina
    const convite = whatsapp.convites()[0]!;
    await de(MARIA, { tipo: "botao", botaoId: convite.args[2] });
    await de(MARIA, { tipo: "botao", botaoId: whatsapp.botao(MARIA, "Assinar") });
    await de(MARIA, { tipo: "texto", texto: "123.456.789-00" });
    expect(whatsapp.ultimoTexto(MARIA)).toContain("não é válido");
    await de(MARIA, { tipo: "texto", texto: CPF_MARIA });
    expect(whatsapp.ultimoTexto(MARIA)).toContain("Assinatura registrada");

    // escritório avisado e João convidado
    expect(whatsapp.ultimoTexto(ESCRITORIO)).toContain("Maria da Silva* (outorgante) assinou");
    expect(whatsapp.convites().map((c) => c.para)).toEqual([MARIA, JOAO]);

    // botão de outra pessoa não vale
    await de("5511900000000", { tipo: "botao", botaoId: whatsapp.convites()[1]!.args[2] });
    expect(whatsapp.ultimoTexto("5511900000000")).toContain("Não encontrei");

    await assinar(JOAO, CPF_JOAO);

    // via final: gerada, assinada digitalmente e enviada a todos
    expect(assinados).toHaveLength(1);
    expect(whatsapp.ultima(ESCRITORIO)).toMatchObject({ metodo: "documento", args: ["Procuração ad judicia - assinado.pdf"] });
    expect(whatsapp.ultima(MARIA)).toMatchObject({ metodo: "documento" });
    expect(whatsapp.ultima(JOAO)).toMatchObject({ metodo: "documento" });

    const envioId = lerBotao(String(whatsapp.convites()[0]!.args[2]))!.envioId;
    expect(banco.envio(envioId)?.status).toBe("concluido");
    const [s1, s2] = banco.signatarios(envioId);
    expect(s1).toMatchObject({ status: "assinado", cpf: "52998224725" });
    expect(s2).toMatchObject({ status: "assinado", cpf: "11144477735", nome: "João Pereira" });

    // página de verificação: concluído, com o CPF parcialmente oculto na internet
    const { status, html } = paginaDeVerificacao(banco, envioId, "Escritório Teste");
    expect(status).toBe(200);
    expect(html).toContain("Assinado por todos");
    expect(html).toContain("***.982.247-**");
    expect(html).not.toContain("529.982.247-25");
    expect(paginaDeVerificacao(banco, "00000000-0000-0000-0000-000000000000", "x").status).toBe(404);

    // depois de concluído, o botão só informa
    await de(MARIA, { tipo: "botao", botaoId: whatsapp.convites()[0]!.args[2] });
    expect(whatsapp.ultimoTexto(MARIA)).toContain("já foi assinado por todos");
  });

  it("recusa encerra o envio e avisa o escritório", async () => {
    await enviarProcuracao();
    const convite = whatsapp.convites()[0]!;
    await de(MARIA, { tipo: "botao", botaoId: convite.args[2] });
    await de(MARIA, { tipo: "botao", botaoId: whatsapp.botao(MARIA, "Recusar") });
    expect(whatsapp.ultimoTexto(ESCRITORIO)).toContain("recusou");
    expect(whatsapp.convites()).toHaveLength(1);
  });

  it("guarda o aviso quando a janela de 24h fechou e entrega quando a pessoa responde", async () => {
    await enviarProcuracao();
    await assinar(MARIA, CPF_MARIA);

    whatsapp.janelaFechada.add(ESCRITORIO).add(MARIA);
    await assinar(JOAO, CPF_JOAO);

    // escritório e Maria recebem só o template de aviso
    expect(whatsapp.ultima(ESCRITORIO)).toMatchObject({ metodo: "template", args: ["aviso_assinatura", expect.any(Array), undefined] });
    expect(whatsapp.ultima(MARIA)).toMatchObject({ metodo: "template", args: ["aviso_assinatura", expect.any(Array), undefined] });
    expect(banco.pendencias(MARIA)).toHaveLength(1);

    whatsapp.janelaFechada.clear();
    await de(MARIA, { tipo: "texto", texto: "oi" });
    expect(banco.pendencias(MARIA)).toHaveLength(0);
    expect(whatsapp.chamadas.filter((c) => c.para === MARIA && c.metodo === "documento").length).toBeGreaterThan(1);
  });

  it("o escritório pode ser um dos signatários", async () => {
    await doEscritorio({ tipo: "documento", mediaId: "m", mimeType: "application/pdf", nomeArquivo: "p.pdf" });
    await doEscritorio({ tipo: "texto", texto: "o outorgado é João Pereira" });
    await doEscritorio({ tipo: "botao", botaoId: "partes_ok" });
    await doEscritorio({ tipo: "botao", botaoId: "eu_assino" });
    await doEscritorio({ tipo: "texto", texto: "51 97777-6666" });
    await doEscritorio({ tipo: "botao", botaoId: "enviar" });

    expect(whatsapp.convites().map((c) => c.para)).toEqual([ESCRITORIO]);
    await assinar(ESCRITORIO, CPF_MARIA);
    expect(whatsapp.convites().map((c) => c.para)).toEqual([ESCRITORIO, JOAO]);
  });

  it("não aceita documentos de números não autorizados", async () => {
    await de("5511900000000", { tipo: "documento", mediaId: "m", mimeType: "application/pdf", nomeArquivo: "a.pdf" });
    expect(whatsapp.ultimoTexto("5511900000000")).toContain("apenas para envio");
  });

  it("ignora mensagem repetida pela Meta", async () => {
    await fluxo.receberMensagem({ de: ESCRITORIO, id: "dup", tipo: "texto", texto: "oi" });
    await fluxo.receberMensagem({ de: ESCRITORIO, id: "dup", tipo: "texto", texto: "oi" });
    expect(whatsapp.chamadas).toHaveLength(1);
  });
});
