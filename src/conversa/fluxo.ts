import { randomUUID } from "node:crypto";
import type { Banco, Envio, Signatario } from "../banco.js";
import type { Config } from "../config.js";
import type { Documenso } from "../assinatura/documenso.js";
import { acrescentarPaginaDeAssinaturas } from "../assinatura/pagina.js";
import type { Analise, IdentificadorDePartes } from "../ia/partes.js";
import { normalizarTelefone } from "../telefone.js";
import { ErroWhatsApp, type WhatsApp } from "../whatsapp/cliente.js";
import type { MensagemRecebida, StatusMensagem } from "../whatsapp/webhook.js";
import { BOTOES, type Estado, type ParteComContato } from "./estado.js";
import { AJUDA, listaDePartes, pedidoDeContato, primeiroNome, resumoParaEnvio } from "./textos.js";

type Mensageiro = Pick<WhatsApp, "enviarTexto" | "enviarBotoes" | "enviarDocumento" | "enviarTemplate" | "baixarMidia">;
type Assinaturas = Pick<Documenso, "criarEEnviar" | "baixarAssinado">;
type Identificador = Pick<IdentificadorDePartes, "analisar" | "corrigir">;

/** Código de erro da Meta quando a janela de 24h fechou e só templates podem ser enviados. */
const JANELA_FECHADA = 131047;
/** Limite de tamanho de PDF aceito pela API da Anthropic. */
const TAMANHO_MAXIMO_PDF = 30 * 1024 * 1024;

export type EventoDocumenso = {
  event: string;
  payload: {
    id: number;
    title?: string;
    recipients?: {
      id: number;
      name: string;
      signingStatus: "NOT_SIGNED" | "SIGNED" | "REJECTED";
      signedAt: string | null;
      rejectionReason: string | null;
    }[];
  };
};

export class Fluxo {
  /** Fila por telefone, para que duas mensagens da mesma pessoa não sejam processadas ao mesmo tempo. */
  private readonly filas = new Map<string, Promise<void>>();

  constructor(
    private readonly config: Config,
    private readonly banco: Banco,
    private readonly whatsapp: Mensageiro,
    private readonly ia: Identificador,
    private readonly documenso: Assinaturas,
  ) {}

  receberMensagem(m: MensagemRecebida): Promise<void> {
    return this.enfileirar(m.de, async () => {
      if (!this.banco.marcarProcessada(m.id)) return;
      try {
        if (this.config.AUTHORIZED_SENDERS.includes(m.de)) {
          await this.entregarPendencias(m.de);
          await this.conversarComEscritorio(m);
        } else {
          await this.responderTerceiro(m);
        }
      } catch (erro) {
        console.error(`Erro ao processar mensagem ${m.id} de ${m.de}:`, erro);
        await this.whatsapp
          .enviarTexto(m.de, "Desculpe, tive um problema para processar sua mensagem. Tente de novo em instantes.")
          .catch(() => {});
      }
    });
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

    const estado: Estado = { etapa: "confirmando_partes", nomeArquivo, analise };
    this.banco.salvarConversa(de, estado, pdf);
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
    await this.whatsapp.enviarTexto(de, "Preparando o documento…");

    let preparado: Awaited<ReturnType<typeof acrescentarPaginaDeAssinaturas>>;
    try {
      preparado = await acrescentarPaginaDeAssinaturas(original, analise.titulo, contatos);
    } catch (erro) {
      console.error("Falha ao preparar o PDF:", erro);
      await this.whatsapp.enviarTexto(de, "Não consegui preparar este PDF (ele pode estar protegido por senha). Envie uma versão sem proteção.");
      return;
    }

    const emails = emailsUnicos(contatos, this.config.SIGNER_PLACEHOLDER_EMAIL_DOMAIN);
    const envioId = randomUUID();
    const criado = await this.documenso.criarEEnviar({
      titulo: analise.titulo,
      idExterno: envioId,
      ordem: analise.ordem,
      signatarios: contatos.map((c, i) => ({ nome: c.nome, email: emails[i]! })),
      pdf: preparado.pdf,
      campos: preparado.campos,
    });

    const envio: Envio = {
      id: envioId,
      remetente: de,
      documentoId: criado.documentoId,
      titulo: analise.titulo,
      ordem: analise.ordem,
      hashOriginal: preparado.hashOriginal,
      status: "aguardando",
    };
    const signatarios: Signatario[] = contatos.map((c, i) => ({
      envioId,
      indice: i,
      papel: c.papel,
      nome: c.nome,
      telefone: c.telefone,
      email: emails[i]!,
      recipientId: criado.signatarios[i]!.recipientId,
      token: criado.signatarios[i]!.token,
      linkEnviadoEm: null,
      assinadoEm: null,
    }));
    this.banco.criarEnvio(envio, signatarios);
    this.banco.registrarEvento(envioId, "envio_criado", { arquivo: nomeArquivo, hashOriginal: preparado.hashOriginal, documentoId: criado.documentoId });
    this.banco.salvarConversa(de, { etapa: "inicio" }, null);

    const primeiros = analise.ordem === "sequencial" ? signatarios.slice(0, 1) : signatarios;
    const falhas: string[] = [];
    for (const s of primeiros) {
      if (!(await this.enviarLink(envio, s))) falhas.push(s.nome);
    }

    const aviso =
      analise.ordem === "sequencial" && signatarios.length > 1
        ? `Link enviado para *${signatarios[0]!.nome}*. Os próximos recebem assim que o anterior assinar.`
        : "Links enviados para todos.";
    const erro = falhas.length ? `\n\n⚠️ Não consegui enviar para: ${falhas.join(", ")}. Confira o número.` : "";
    await this.whatsapp.enviarTexto(de, `✅ *${analise.titulo}* enviado para assinatura.\n${aviso}\n\nEu aviso aqui a cada assinatura.${erro}`);
  }

  /** Manda o link de assinatura pelo template aprovado. Devolve false se a Meta recusar. */
  private async enviarLink(envio: Envio, s: Signatario): Promise<boolean> {
    try {
      const mensagemId = await this.whatsapp.enviarTemplate(
        s.telefone,
        this.config.WHATSAPP_TEMPLATE_SOLICITACAO,
        [primeiroNome(s.nome), this.config.SENDER_DISPLAY_NAME, envio.titulo],
        s.token,
      );
      this.banco.marcarLinkEnviado(envio.id, s.indice, mensagemId);
      this.banco.registrarEvento(envio.id, "link_enviado", { indice: s.indice, telefone: s.telefone, mensagemId });
      return true;
    } catch (erro) {
      console.error(`Falha ao enviar link para ${s.telefone}:`, erro);
      this.banco.registrarEvento(envio.id, "falha_envio_link", { indice: s.indice, telefone: s.telefone, erro: String(erro) });
      return false;
    }
  }

  // ---------------------------------------------------------------- terceiros

  private async responderTerceiro(m: MensagemRecebida): Promise<void> {
    const texto = this.banco.ehSignatario(m.de)
      ? `Olá! Para ler e assinar o documento, toque no botão *Ler e assinar* da mensagem que você recebeu. Dúvidas sobre o conteúdo: fale diretamente com ${this.config.SENDER_DISPLAY_NAME}.`
      : `Olá! Este número é usado apenas para envio de documentos para assinatura de ${this.config.SENDER_DISPLAY_NAME}.`;
    await this.whatsapp.enviarTexto(m.de, texto);
  }

  // ---------------------------------------------------------------- eventos

  /** Confirmações de entrega e leitura das mensagens que enviamos. */
  receberStatus(s: StatusMensagem): Promise<void> {
    const ref = this.banco.envioDaMensagem(s.mensagemId);
    if (!ref) return Promise.resolve();
    this.banco.registrarEvento(ref.envioId, `whatsapp_${s.status}`, s);
    if (s.status !== "failed") return Promise.resolve();

    const envio = this.banco.envioPorId(ref.envioId);
    const signatario = this.banco.signatarios(ref.envioId).find((x) => x.indice === ref.indice);
    if (!envio || !signatario) return Promise.resolve();
    return this.enfileirar(envio.remetente, () =>
      this.avisar(
        envio,
        `⚠️ O WhatsApp não entregou o link para *${signatario.nome}* (${s.erro ?? "erro desconhecido"}). Confira o número.`,
      ),
    );
  }

  /** Webhooks do Documenso: alguém assinou, recusou, ou o documento foi concluído. */
  receberEventoDocumenso(evento: EventoDocumenso): Promise<void> {
    const envio = this.banco.envioPorDocumento(evento.payload.id);
    if (!envio) return Promise.resolve();
    this.banco.registrarEvento(envio.id, `documenso_${evento.event}`, evento.payload.recipients ?? null);

    return this.enfileirar(envio.remetente, async () => {
      const signatarios = this.banco.signatarios(envio.id);
      const porRecipient = new Map(signatarios.map((s) => [s.recipientId, s]));

      for (const r of evento.payload.recipients ?? []) {
        const s = porRecipient.get(r.id);
        if (!s) continue;
        if (r.signingStatus === "SIGNED" && this.banco.marcarAssinado(envio.id, r.id, r.signedAt ?? new Date().toISOString())) {
          s.assinadoEm = r.signedAt ?? new Date().toISOString();
          const feitos = this.banco.signatarios(envio.id).filter((x) => x.assinadoEm).length;
          // Na conclusão vai um aviso só, com o PDF
          if (evento.event !== "DOCUMENT_COMPLETED" && feitos < signatarios.length) {
            await this.avisar(envio, `✍️ *${s.nome}* (${s.papel}) assinou *${envio.titulo}*. Faltam ${signatarios.length - feitos}.`);
          }
        }
        if (r.signingStatus === "REJECTED" && envio.status === "aguardando") {
          this.banco.atualizarStatusEnvio(envio.id, "recusado");
          envio.status = "recusado";
          const motivo = r.rejectionReason ? `\nMotivo: ${r.rejectionReason}` : "";
          await this.avisar(envio, `❌ *${s.nome}* recusou assinar *${envio.titulo}*.${motivo}`);
        }
      }

      if (envio.status !== "aguardando") return;

      if (evento.event === "DOCUMENT_COMPLETED") {
        this.banco.atualizarStatusEnvio(envio.id, "concluido");
        await this.avisar(envio, `🎉 *${envio.titulo}* foi assinado por todos. Segue o PDF assinado, com o certificado de assinaturas.`, true);
        return;
      }

      if (envio.ordem === "sequencial") {
        const atualizados = this.banco.signatarios(envio.id);
        const proximo = atualizados.find((s) => !s.assinadoEm);
        if (proximo && !proximo.linkEnviadoEm && atualizados.slice(0, proximo.indice).every((s) => s.assinadoEm)) {
          const ok = await this.enviarLink(envio, proximo);
          if (!ok) await this.avisar(envio, `⚠️ Não consegui enviar o link para *${proximo.nome}*. Confira o número.`);
        }
      }
    });
  }

  // ---------------------------------------------------------------- utilidades

  /**
   * Avisa o escritório. Fora da janela de 24h do WhatsApp, só templates passam: nesse caso
   * mandamos o template de aviso e guardamos a mensagem completa para a próxima vez que o
   * escritório escrever.
   */
  private async avisar(envio: Pick<Envio, "remetente" | "titulo" | "documentoId">, texto: string, comPdf = false): Promise<void> {
    const nomeArquivo = `${envio.titulo.replace(/[\\/:*?"<>|]+/g, " ").trim()} - assinado.pdf`;
    try {
      await this.whatsapp.enviarTexto(envio.remetente, texto);
      if (comPdf) {
        const pdf = await this.documenso.baixarAssinado(envio.documentoId);
        await this.whatsapp.enviarDocumento(envio.remetente, pdf, nomeArquivo);
      }
    } catch (erro) {
      if (!(erro instanceof ErroWhatsApp && erro.codigo === JANELA_FECHADA)) throw erro;
      const jaAvisado = this.banco.pendencias(envio.remetente).length > 0;
      this.banco.adicionarPendencia(envio.remetente, texto, comPdf ? envio.documentoId : null, comPdf ? nomeArquivo : null);
      // Um template basta: ao responder, o escritório recebe todas as pendências
      if (jaAvisado) return;
      await this.whatsapp.enviarTemplate(envio.remetente, this.config.WHATSAPP_TEMPLATE_AVISO, [
        envio.titulo,
        texto.replace(/[*_]/g, "").replace(/\s+/g, " ").slice(0, 200),
      ]);
    }
  }

  private async entregarPendencias(telefone: string): Promise<void> {
    for (const p of this.banco.pendencias(telefone)) {
      await this.whatsapp.enviarTexto(telefone, p.texto);
      if (p.documentoId !== null) {
        const pdf = await this.documenso.baixarAssinado(p.documentoId);
        await this.whatsapp.enviarDocumento(telefone, pdf, p.nomeArquivo ?? "documento assinado.pdf");
      }
      this.banco.removerPendencia(p.id);
    }
  }

  private enfileirar(chave: string, tarefa: () => Promise<void>): Promise<void> {
    const anterior = this.filas.get(chave) ?? Promise.resolve();
    const atual = anterior.then(tarefa).catch((erro) => console.error(`Erro na fila de ${chave}:`, erro));
    this.filas.set(chave, atual);
    void atual.finally(() => {
      if (this.filas.get(chave) === atual) this.filas.delete(chave);
    });
    return atual;
  }
}

// ------------------------------------------------------------------ contatos

type Parte = Analise["partes"][number];

export function contatoDoCartao(parte: Parte, cartoes: { nome: string; telefones: string[]; email?: string }[]): ParteComContato | string {
  const cartao = cartoes[0];
  const telefone = cartao?.telefones.map(normalizarTelefone).find((t) => t !== null);
  if (!cartao || !telefone) return "Esse contato não tem um número de telefone válido. Envie outro ou digite o número.";
  const nome = parte.nome ?? cartao.nome.trim();
  if (!nome) return "O contato veio sem nome. Digite o nome completo e o número. Ex.: _Maria da Silva, 51 99999-8888_";
  return { papel: parte.papel, nome, telefone, ...(cartao.email ? { email: cartao.email } : {}) };
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

/** O Documenso exige e-mail único por signatário; sem e-mail informado, usamos um derivado do telefone. */
export function emailsUnicos(contatos: ParteComContato[], dominio: string): string[] {
  const usados = new Set<string>();
  return contatos.map((c) => {
    let email = (c.email ?? `${c.telefone}@${dominio}`).toLowerCase();
    if (usados.has(email)) {
      const [local, host] = email.split("@");
      let n = 2;
      while (usados.has(`${local}+${n}@${host}`)) n++;
      email = `${local}+${n}@${host}`;
    }
    usados.add(email);
    return email;
  });
}
