import { randomUUID } from "node:crypto";
import type { Envio, Repositorio } from "../banco.js";
import type { Config } from "../config.js";
import { prepararDocumento } from "../assinatura/pagina.js";
import type { Analise, IdentificadorDePartes } from "../ia/partes.js";
import { normalizarTelefone } from "../telefone.js";
import type { MensagemRecebida, StatusMensagem } from "../whatsapp/webhook.js";
import type { Avisador, Filas, Mensageiro } from "./avisos.js";
import { BOTOES, type Estado, type ParteComContato } from "./estado.js";
import { type ColetaDeAssinaturas, lerBotao } from "./signatario.js";
import { AJUDA, listaDePartes, pedidoDeContato, resumoParaEnvio } from "./textos.js";

type Identificador = Pick<IdentificadorDePartes, "analisar" | "corrigir">;

/** Limite de tamanho de PDF aceito pela API da Anthropic. */
const TAMANHO_MAXIMO_PDF = 30 * 1024 * 1024;

/** Recebe tudo que chega do WhatsApp e encaminha para o escritório ou para quem assina. */
export class Fluxo {
  constructor(
    private readonly config: Config,
    private readonly banco: Repositorio,
    private readonly whatsapp: Mensageiro,
    private readonly ia: Identificador,
    private readonly coleta: ColetaDeAssinaturas,
    private readonly avisos: Avisador,
    private readonly filas: Filas,
  ) {}

  receberMensagem(m: MensagemRecebida): Promise<void> {
    return this.filas
      .executar(`tel:${m.de}`, async () => {
        if (!this.banco.marcarProcessada(m.id)) return;
        await this.avisos.entregarPendencias(m.de);

        const ehEscritorio = this.config.AUTHORIZED_SENDERS.includes(m.de);

        // Botões de assinatura valem para qualquer pessoa, inclusive o escritório quando também assina
        if (m.tipo === "botao" && lerBotao(m.botaoId)) {
          await this.coleta.tratarBotao(m.de, m.id, m.botaoId);
          return;
        }

        // CPF de uma assinatura em andamento (para o escritório, só fora de outro processo)
        const aguardando = m.tipo === "texto" ? this.banco.aguardandoCpf(m.de) : null;
        if (aguardando && m.tipo === "texto" && (!ehEscritorio || this.banco.lerConversa(m.de).estado.etapa === "inicio")) {
          await this.coleta.tratarCpf(aguardando, m.id, m.texto);
          return;
        }

        if (ehEscritorio) await this.conversarComEscritorio(m);
        else await this.responderTerceiro(m);
      })
      .catch(async (erro) => {
        console.error(`Erro ao processar mensagem ${m.id} de ${m.de}:`, erro);
        await this.whatsapp
          .enviarTexto(m.de, "Desculpe, tive um problema para processar sua mensagem. Tente de novo em instantes.")
          .catch(() => {});
      });
  }

  /** Confirmações de entrega e leitura das mensagens que enviamos. */
  async receberStatus(s: StatusMensagem): Promise<void> {
    const ref = this.banco.envioDaMensagem(s.mensagemId);
    if (!ref) return;
    this.banco.registrarEvento(ref.envioId, `whatsapp_${s.status}`, s);
    if (s.status !== "failed" || ref.indice === null) return;

    const envio = this.banco.envio(ref.envioId);
    const signatario = this.banco.signatario(ref.envioId, ref.indice);
    if (!envio || !signatario) return;
    await this.filas.executar(`tel:${envio.remetente}`, () =>
      this.avisos.avisar(
        envio.remetente,
        envio.titulo,
        `⚠️ O WhatsApp não entregou a mensagem para *${signatario.nome}* (${s.erro ?? "erro desconhecido"}). Confira o número.`,
      ),
    );
  }

  // ---------------------------------------------------------------- escritório

  private async conversarComEscritorio(m: MensagemRecebida): Promise<void> {
    const de = m.de;
    const { estado, pdf } = this.banco.lerConversa(de);

    if ((m.tipo === "texto" && /^\s*cancelar\s*$/i.test(m.texto)) || (m.tipo === "botao" && m.botaoId === BOTOES.cancelar.id)) {
      this.banco.salvarConversa(de, { etapa: "inicio" }, null);
      await this.whatsapp.enviarTexto(de, "Cancelado. Quando quiser, é só mandar outro PDF.");
      return;
    }

    // Um PDF novo sempre recomeça o processo
    if (m.tipo === "documento") {
      await this.receberDocumento(de, m.mediaId, m.mimeType, m.nomeArquivo);
      return;
    }

    switch (estado.etapa) {
      case "inicio":
        await this.whatsapp.enviarTexto(de, AJUDA);
        return;

      case "confirmando_partes":
        if (m.tipo === "botao" && m.botaoId === BOTOES.confirmarPartes.id) {
          if (estado.analise.partes.length === 0) {
            this.banco.salvarConversa(de, { ...estado, etapa: "corrigindo_partes" });
            await this.whatsapp.enviarTexto(de, "Não encontrei ninguém para assinar. Escreva quem são as partes.");
            return;
          }
          const proximo: Estado = { ...estado, etapa: "coletando_contatos", contatos: [] };
          this.banco.salvarConversa(de, proximo);
          await this.pedirProximoContato(de, proximo);
        } else if (m.tipo === "botao" && m.botaoId === BOTOES.corrigirPartes.id) {
          this.banco.salvarConversa(de, { ...estado, etapa: "corrigindo_partes" });
          await this.whatsapp.enviarTexto(
            de,
            "Escreva o que precisa mudar. Ex.: _o outorgado é João Pereira_, _tire a testemunha_, _a ordem não importa_.",
          );
        } else if (m.tipo === "texto") {
          // Texto livre nesta etapa já vale como correção
          await this.corrigirPartes(de, { ...estado, etapa: "corrigindo_partes" }, pdf, m.texto);
        } else {
          await this.mostrarPartes(de, estado.analise);
        }
        return;

      case "corrigindo_partes":
        if (m.tipo === "texto") await this.corrigirPartes(de, estado, pdf, m.texto);
        else await this.whatsapp.enviarTexto(de, "Escreva em texto o que precisa ser corrigido.");
        return;

      case "coletando_contatos":
        await this.receberContato(de, estado, m);
        return;

      case "confirmando_envio":
        if (m.tipo === "botao" && m.botaoId === BOTOES.enviar.id) {
          if (!pdf) throw new Error("PDF da conversa não encontrado");
          await this.enviarParaAssinatura(de, estado.nomeArquivo, estado.analise, estado.contatos, pdf);
        } else {
          await this.whatsapp.enviarBotoes(de, resumoParaEnvio(estado.analise, estado.contatos), [
            BOTOES.enviar,
            BOTOES.cancelar,
          ]);
        }
        return;
    }
  }

  private async receberDocumento(de: string, mediaId: string, mimeType: string, nomeArquivo: string): Promise<void> {
    if (mimeType !== "application/pdf") {
      await this.whatsapp.enviarTexto(de, "Por enquanto só consigo trabalhar com arquivos *PDF*. Converta o documento e envie de novo.");
      return;
    }
    await this.whatsapp.enviarTexto(de, "Recebi! Estou lendo o documento para identificar quem assina…");

    const pdf = await this.whatsapp.baixarMidia(mediaId);
    if (pdf.byteLength > TAMANHO_MAXIMO_PDF) {
      await this.whatsapp.enviarTexto(de, "O PDF passa de 30 MB. Envie uma versão menor.");
      return;
    }

    let analise: Analise;
    try {
      analise = await this.ia.analisar(pdf);
    } catch (erro) {
      console.error("Falha na análise do documento:", erro);
      await this.whatsapp.enviarTexto(de, "Não consegui ler este PDF. Confira se ele não está protegido por senha e tente de novo.");
      return;
    }

    this.banco.salvarConversa(de, { etapa: "confirmando_partes", nomeArquivo, analise }, pdf);
    await this.mostrarPartes(de, analise);
  }

  private async mostrarPartes(de: string, analise: Analise): Promise<void> {
    await this.whatsapp.enviarBotoes(de, listaDePartes(analise), [BOTOES.confirmarPartes, BOTOES.corrigirPartes, BOTOES.cancelar]);
  }

  private async corrigirPartes(
    de: string,
    estado: Extract<Estado, { etapa: "corrigindo_partes" }>,
    pdf: Uint8Array | null,
    correcao: string,
  ): Promise<void> {
    if (!pdf) throw new Error("PDF da conversa não encontrado");
    const analise = await this.ia.corrigir(pdf, estado.analise, correcao);
    this.banco.salvarConversa(de, { etapa: "confirmando_partes", nomeArquivo: estado.nomeArquivo, analise });
    await this.mostrarPartes(de, analise);
  }

  private async pedirProximoContato(de: string, estado: Extract<Estado, { etapa: "coletando_contatos" }>): Promise<void> {
    const indice = estado.contatos.length;
    const parte = estado.analise.partes[indice]!;
    const texto = pedidoDeContato(parte.papel, parte.nome, indice + 1, estado.analise.partes.length);
    await this.whatsapp.enviarBotoes(de, texto, [BOTOES.euAssino, BOTOES.cancelar]);
  }

  private async receberContato(
    de: string,
    estado: Extract<Estado, { etapa: "coletando_contatos" }>,
    m: MensagemRecebida,
  ): Promise<void> {
    const parte = estado.analise.partes[estado.contatos.length]!;
    let contato: ParteComContato | string;

    if (m.tipo === "botao" && m.botaoId === BOTOES.euAssino.id) {
      contato = parte.nome
        ? { papel: parte.papel, nome: parte.nome, telefone: de }
        : "Como o nome desta parte está em branco no documento, digite seu nome completo e seu número.";
    } else if (m.tipo === "contato") {
      contato = contatoDoCartao(parte, m.contatos);
    } else if (m.tipo === "texto") {
      contato = contatoDoTexto(parte, m.texto);
    } else {
      contato = "Envie o contato da agenda ou digite o número com DDD.";
    }

    if (typeof contato === "string") {
      await this.whatsapp.enviarTexto(de, contato);
      return;
    }

    const contatos = [...estado.contatos, contato];
    if (contatos.length < estado.analise.partes.length) {
      const proximo: Estado = { ...estado, contatos };
      this.banco.salvarConversa(de, proximo);
      await this.pedirProximoContato(de, proximo);
      return;
    }

    this.banco.salvarConversa(de, { ...estado, etapa: "confirmando_envio", contatos });
    await this.whatsapp.enviarBotoes(de, resumoParaEnvio(estado.analise, contatos), [BOTOES.enviar, BOTOES.cancelar]);
  }

  private async enviarParaAssinatura(
    de: string,
    nomeArquivo: string,
    analise: Analise,
    contatos: ParteComContato[],
    original: Uint8Array,
  ): Promise<void> {
    let preparado: Awaited<ReturnType<typeof prepararDocumento>>;
    try {
      preparado = await prepararDocumento(original, analise.titulo, contatos);
    } catch (erro) {
      console.error("Falha ao preparar o PDF:", erro);
      await this.whatsapp.enviarTexto(de, "Não consegui preparar este PDF (ele pode estar protegido por senha). Envie uma versão sem proteção.");
      return;
    }

    const envio: Envio = {
      id: randomUUID(),
      remetente: de,
      titulo: analise.titulo,
      ordem: analise.ordem,
      hashOriginal: preparado.hashOriginal,
      pdfApresentado: preparado.pdf,
      blocos: preparado.blocos,
      status: "aguardando",
      criadoEm: new Date().toISOString(),
    };
    this.banco.criarEnvio(envio, contatos);
    this.banco.registrarEvento(envio.id, "envio_criado", { arquivo: nomeArquivo, hashOriginal: preparado.hashOriginal });
    this.banco.salvarConversa(de, { etapa: "inicio" }, null);

    const falhas = await this.coleta.iniciar(envio);
    const aviso =
      analise.ordem === "sequencial" && contatos.length > 1
        ? `Enviei para *${contatos[0]!.nome}*. Os próximos recebem assim que o anterior assinar.`
        : "Enviei para todos.";
    const erro = falhas.length ? `\n\n⚠️ Não consegui enviar para: ${falhas.join(", ")}. Confira o número.` : "";
    await this.whatsapp.enviarTexto(
      de,
      `✅ *${analise.titulo}* enviado para assinatura.\n${aviso}\n\nEu aviso aqui a cada assinatura.${erro}`,
    );
  }

  // ---------------------------------------------------------------- terceiros

  private async responderTerceiro(m: MensagemRecebida): Promise<void> {
    const texto = this.banco.ehSignatario(m.de)
      ? `Olá! Para ver e assinar o documento, toque em *Ver documento* na mensagem que você recebeu. Dúvidas sobre o conteúdo: fale diretamente com ${this.config.SENDER_DISPLAY_NAME}.`
      : `Olá! Este número é usado apenas para envio de documentos para assinatura de ${this.config.SENDER_DISPLAY_NAME}.`;
    await this.whatsapp.enviarTexto(m.de, texto);
  }
}

// ------------------------------------------------------------------ contatos

type Parte = Analise["partes"][number];

export function contatoDoCartao(parte: Parte, cartoes: { nome: string; telefones: string[] }[]): ParteComContato | string {
  const cartao = cartoes[0];
  const telefone = cartao?.telefones.map(normalizarTelefone).find((t) => t !== null);
  if (!cartao || !telefone) return "Esse contato não tem um número de telefone válido. Envie outro ou digite o número.";
  const nome = parte.nome ?? cartao.nome.trim();
  if (!nome) return "O contato veio sem nome. Digite o nome completo e o número. Ex.: _Maria da Silva, 51 99999-8888_";
  return { papel: parte.papel, nome, telefone };
}

export function contatoDoTexto(parte: Parte, texto: string): ParteComContato | string {
  const numero = texto.match(/\+?[\d\s().-]{8,}/)?.[0];
  const telefone = numero ? normalizarTelefone(numero) : null;
  if (!telefone) return "Não reconheci o número. Digite com DDD, ex.: _51 99999-8888_, ou compartilhe o contato.";
  const nomeDigitado = texto
    .replace(numero!, " ")
    .replace(/[,;:\-–]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const nome = parte.nome ?? nomeDigitado;
  if (!nome) return "Faltou o nome completo de quem assina. Ex.: _Maria da Silva, 51 99999-8888_";
  return { papel: parte.papel, nome, telefone };
}
