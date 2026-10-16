import type { Envio, Repositorio, Signatario } from "../banco.js";
import type { Config } from "../config.js";
import { formatarCpf, validarCpf } from "../cpf.js";
import type { AssinadorDePdf } from "../assinatura/certificado.js";
import type { Carimbador } from "../assinatura/carimbo.js";
import { finalizarDocumento, type RegistroDeAssinatura, sha256 } from "../assinatura/pagina.js";
import { urlDeVerificacao } from "../verificacao.js";
import { formatarTelefone } from "../telefone.js";
import { type Avisador, type Filas, type Mensageiro, nomeDeArquivo } from "./avisos.js";
import { primeiroNome } from "./textos.js";

/** A selfie entra no PDF final, que só aceita estes formatos de imagem. */
const TIPOS_DE_FOTO = ["image/jpeg", "image/jpg", "image/png"];
const TAMANHO_MAXIMO_SELFIE = 8 * 1024 * 1024;

/** Botões da conversa com quem assina; o id leva o envio e a posição do signatário. */
export const ACOES = ["ver", "assinar", "recusar", "confirmar", "corrigir"] as const;
export type Acao = (typeof ACOES)[number];

export function idDoBotao(acao: Acao, envioId: string, indice: number): string {
  return `${acao}:${envioId}:${indice}`;
}

export function lerBotao(id: string): { acao: Acao; envioId: string; indice: number } | null {
  const m = /^(ver|assinar|recusar|confirmar|corrigir):([0-9a-f-]{36}):(\d+)$/.exec(id);
  return m ? { acao: m[1] as Acao, envioId: m[2]!, indice: Number(m[3]) } : null;
}

/**
 * Lado de quem assina: convite, leitura do documento, confirmação com CPF, recusa,
 * e a geração da via final quando todos assinam.
 */
export class ColetaDeAssinaturas {
  constructor(
    private readonly config: Config,
    private readonly banco: Repositorio,
    private readonly whatsapp: Mensageiro,
    private readonly avisos: Avisador,
    private readonly assinador: Pick<AssinadorDePdf, "assinar">,
    private readonly filas: Filas,
    /** Pede o carimbo do tempo do hash da via final; sem ele, a via sai sem carimbo. */
    private readonly carimbador?: Carimbador,
  ) {}

  /** Convida quem deve assinar agora: o primeiro (sequencial) ou todos (simultânea). Devolve quem falhou. */
  async iniciar(envio: Envio): Promise<string[]> {
    const signatarios = this.banco.signatarios(envio.id);
    const agora = envio.ordem === "sequencial" ? signatarios.slice(0, 1) : signatarios;
    const falhas: string[] = [];
    for (const s of agora) {
      if (!(await this.convidar(envio, s))) falhas.push(s.nome);
    }
    return falhas;
  }

  async tratarBotao(de: string, mensagemId: string, botaoId: string): Promise<void> {
    const botao = lerBotao(botaoId);
    const envio = botao ? this.banco.envio(botao.envioId) : null;
    const s = botao && envio ? this.banco.signatario(envio.id, botao.indice) : null;
    // O botão só vale no WhatsApp de quem foi convidado
    if (!botao || !envio || !s || s.telefone !== de) {
      await this.whatsapp.enviarTexto(de, "Não encontrei este documento. Se tiver dúvida, fale com quem enviou.");
      return;
    }
    await this.filas.executar(`envio:${envio.id}`, async () => {
      const atual = this.banco.signatario(envio.id, s.indice)!;
      const envioAtual = this.banco.envio(envio.id)!;
      if (envioAtual.status === "concluido") {
        await this.whatsapp.enviarTexto(de, "Este documento já foi assinado por todos. A via final foi enviada aqui na conversa.");
        return;
      }
      if (atual.status === "recusado" || envioAtual.status !== "aguardando") {
        await this.whatsapp.enviarTexto(de, "Este documento não está mais disponível para assinatura.");
        return;
      }
      if (atual.status === "assinado") {
        await this.whatsapp.enviarTexto(de, "Você já assinou este documento. A via final chega aqui quando todos assinarem.");
        return;
      }
      this.banco.registrarEvento(envio.id, `botao_${botao.acao}`, { indice: s.indice, mensagemId });
      if (botao.acao === "ver") await this.mostrarDocumento(envioAtual, atual);
      else if (botao.acao === "assinar") await this.pedirCpf(envioAtual, atual);
      else if (botao.acao === "recusar") await this.recusar(envioAtual, atual);
      else if (atual.status !== "aguardando_confirmacao") {
        await this.whatsapp.enviarTexto(de, "Este botão não vale mais. Siga a última mensagem que você recebeu.");
      } else if (botao.acao === "confirmar") await this.concluirAssinatura(envioAtual, atual, mensagemId);
      else {
        // Corrigir o CPF: a selfie, se já foi enviada, continua valendo
        this.banco.atualizarSignatario(envio.id, s.indice, { status: "aguardando_cpf" });
        await this.whatsapp.enviarTexto(de, "Tudo bem. Digite o seu *CPF* de novo (só os números).");
      }
    });
  }

  /** Texto de quem tem uma assinatura esperando o CPF. */
  async tratarCpf(s: Signatario, mensagemId: string, texto: string): Promise<void> {
    await this.filas.executar(`envio:${s.envioId}`, async () => {
      const atual = this.banco.signatario(s.envioId, s.indice);
      const envio = this.banco.envio(s.envioId);
      if (!atual || !envio || atual.status !== "aguardando_cpf" || envio.status !== "aguardando") return;

      const cpf = validarCpf(texto);
      if (!cpf) {
        await this.whatsapp.enviarTexto(atual.telefone, "Esse CPF não é válido. Confira os números e digite de novo.");
        return;
      }
      this.banco.registrarEvento(s.envioId, "cpf_informado", { indice: s.indice, mensagemId });
      if (envio.exigeSelfie && !atual.selfieEm) {
        this.banco.atualizarSignatario(s.envioId, s.indice, { status: "aguardando_selfie", cpf });
        await this.pedirSelfie(atual.telefone);
        return;
      }
      this.banco.atualizarSignatario(s.envioId, s.indice, { status: "aguardando_confirmacao", cpf });
      await this.mostrarRevisao(envio, { ...atual, cpf });
    });
  }

  /** Foto recebida de quem tem uma assinatura esperando a selfie: conclui a assinatura. */
  async tratarSelfie(s: Signatario, mensagemId: string, mediaId: string, tipo: string): Promise<void> {
    await this.filas.executar(`envio:${s.envioId}`, async () => {
      const atual = this.banco.signatario(s.envioId, s.indice);
      const envio = this.banco.envio(s.envioId);
      if (!atual || !envio || atual.status !== "aguardando_selfie" || envio.status !== "aguardando") return;

      if (!TIPOS_DE_FOTO.includes(tipo)) {
        await this.whatsapp.enviarTexto(atual.telefone, "Envie a selfie como foto (JPG ou PNG), pela câmera do WhatsApp.");
        return;
      }
      const dados = await this.whatsapp.baixarMidia(mediaId);
      if (dados.byteLength > TAMANHO_MAXIMO_SELFIE) {
        await this.whatsapp.enviarTexto(atual.telefone, "A foto ficou grande demais. Tire outra pela câmera do WhatsApp e envie de novo.");
        return;
      }
      this.banco.salvarSelfie(s.envioId, s.indice, { dados, tipo }, new Date().toISOString());
      this.banco.atualizarSignatario(s.envioId, s.indice, { status: "aguardando_confirmacao" });
      this.banco.registrarEvento(s.envioId, "selfie_recebida", { indice: s.indice, mensagemId });
      await this.whatsapp.enviarTexto(atual.telefone, "📷 Selfie recebida.");
      await this.mostrarRevisao(envio, atual);
    });
  }

  /** Mensagem de texto de quem está na revisão: mostra a revisão de novo. */
  async lembrarRevisao(s: Signatario): Promise<void> {
    const envio = this.banco.envio(s.envioId);
    if (envio) await this.mostrarRevisao(envio, s);
  }

  /** Mensagem de texto de quem deveria mandar a selfie. */
  async lembrarSelfie(s: Signatario): Promise<void> {
    await this.pedirSelfie(s.telefone);
  }

  /**
   * Lembra quem foi convidado e não assinou depois de REMINDER_AFTER_HOURS, até REMINDER_MAX vezes,
   * e avisa o escritório. Roda de tempos em tempos; `agora` existe para os testes e o simulador.
   */
  async enviarLembretes(agora: Date = new Date()): Promise<void> {
    const limite = this.config.REMINDER_AFTER_HOURS * 3600_000;
    for (const s of this.banco.emAndamento()) {
      const referencia = s.ultimoLembreteEm ?? s.linkEnviadoEm;
      if (!referencia || agora.getTime() - new Date(referencia).getTime() < limite) continue;
      if (s.lembretes > this.config.REMINDER_MAX) continue;

      await this.filas.executar(`envio:${s.envioId}`, async () => {
        const envio = this.banco.envio(s.envioId);
        if (!envio || envio.status !== "aguardando") return;
        const quando = agora.toISOString();
        if (s.lembretes < this.config.REMINDER_MAX) {
          if (!(await this.convidar(envio, s, true))) return;
          this.banco.atualizarSignatario(s.envioId, s.indice, { lembretes: s.lembretes + 1, ultimoLembreteEm: quando });
          await this.avisos.avisar(
            envio.remetente,
            envio.titulo,
            `🔔 Mandei um lembrete para *${s.nome}* assinar *${envio.titulo}* (${s.lembretes + 1}º de ${this.config.REMINDER_MAX}).`,
          );
        } else {
          this.banco.atualizarSignatario(s.envioId, s.indice, { lembretes: s.lembretes + 1, ultimoLembreteEm: quando });
          await this.avisos.avisar(
            envio.remetente,
            envio.titulo,
            `⏰ *${s.nome}* ainda não assinou *${envio.titulo}*, mesmo depois de ${this.config.REMINDER_MAX} lembretes. ` +
              `Talvez valha ligar: ${formatarTelefone(s.telefone)}.`,
          );
        }
      });
    }
  }

  /** Tenta de novo o carimbo do tempo de vias concluídas que ficaram sem (TSA fora do ar, por exemplo). */
  async carimbarPendentes(): Promise<void> {
    for (const id of this.banco.concluidosSemCarimbo()) {
      const final = this.banco.pdfFinal(id);
      if (final) await this.carimbar(id, final);
    }
  }

  private async carimbar(envioId: string, final: Uint8Array): Promise<void> {
    if (!this.carimbador) return;
    try {
      const carimbo = await this.carimbador(sha256(final));
      this.banco.salvarCarimbo(envioId, carimbo);
      this.banco.registrarEvento(envioId, "carimbo_do_tempo", { em: carimbo.em, autoridade: carimbo.autoridade });
    } catch (erro) {
      console.error(`Carimbo do tempo do envio ${envioId} falhou (será tentado de novo):`, erro);
    }
  }

  // ---------------------------------------------------------------- etapas

  /** Última etapa: a pessoa confere nome e CPF e confirma a assinatura. */
  private async mostrarRevisao(envio: Envio, s: Signatario): Promise<void> {
    await this.whatsapp.enviarBotoes(
      s.telefone,
      `*Confirme seus dados*\n\n📄 ${envio.titulo}\nNome: *${s.nome}*\nCPF: *${formatarCpf(s.cpf ?? "")}*` +
        (envio.exigeSelfie ? "\nSelfie com documento: enviada" : "") +
        "\n\nAo tocar em *Confirmar assinatura*, você confirma que estes dados estão corretos, que leu e concorda com o documento " +
        "e que assina por livre vontade.",
      [
        { id: idDoBotao("confirmar", envio.id, s.indice), titulo: "Confirmar assinatura" },
        { id: idDoBotao("corrigir", envio.id, s.indice), titulo: "Corrigir CPF" },
      ],
    );
  }

  /** Toque em "Confirmar assinatura": a assinatura vale a partir daqui. */
  private async concluirAssinatura(envio: Envio, s: Signatario, mensagemId: string): Promise<void> {
    const assinadoEm = new Date().toISOString();
    this.banco.atualizarSignatario(envio.id, s.indice, { status: "assinado", assinadoEm, mensagemAssinaturaId: mensagemId });
    this.banco.registrarEvento(envio.id, "assinado", { indice: s.indice, mensagemId, assinadoEm, selfie: Boolean(s.selfieEm) });
    await this.whatsapp.enviarTexto(s.telefone, "✅ Assinatura registrada! Quando todos assinarem, você recebe aqui a via final do documento.");
    await this.avancar(envio, s);
  }

  private async pedirSelfie(telefone: string): Promise<void> {
    await this.whatsapp.enviarTexto(
      telefone,
      "Falta só uma etapa: envie uma *selfie segurando seu documento de identidade* (RG ou CNH), " +
        "com o rosto e o documento bem visíveis. Use a câmera do WhatsApp 📷.",
    );
  }

  /** Manda o convite (template com o botão "Ver documento"). Como lembrete, não muda a situação da pessoa. */
  private async convidar(envio: Envio, s: Signatario, lembrete = false): Promise<boolean> {
    try {
      const mensagemId = await this.whatsapp.enviarTemplate(
        s.telefone,
        this.config.WHATSAPP_TEMPLATE_SOLICITACAO,
        [primeiroNome(s.nome), this.config.SENDER_DISPLAY_NAME, envio.titulo],
        idDoBotao("ver", envio.id, s.indice),
      );
      if (!lembrete) {
        this.banco.atualizarSignatario(envio.id, s.indice, { status: "convidado", linkEnviadoEm: new Date().toISOString() });
      }
      this.banco.vincularMensagem(mensagemId, envio.id, s.indice);
      this.banco.registrarEvento(envio.id, lembrete ? "lembrete_enviado" : "convite_enviado", { indice: s.indice, telefone: s.telefone, mensagemId });
      return true;
    } catch (erro) {
      console.error(`Falha ao convidar ${s.telefone}:`, erro);
      this.banco.registrarEvento(envio.id, "falha_convite", { indice: s.indice, telefone: s.telefone, erro: String(erro) });
      return false;
    }
  }

  private async mostrarDocumento(envio: Envio, s: Signatario): Promise<void> {
    const mensagemId = await this.whatsapp.enviarDocumento(s.telefone, envio.pdfApresentado, nomeDeArquivo(envio.titulo, ""));
    this.banco.vincularMensagem(mensagemId, envio.id, s.indice);
    if (!s.visualizadoEm) {
      this.banco.atualizarSignatario(envio.id, s.indice, { status: "visualizou", visualizadoEm: new Date().toISOString() });
    }
    await this.whatsapp.enviarBotoes(
      s.telefone,
      `Este é o documento *${envio.titulo}*, enviado por ${this.config.SENDER_DISPLAY_NAME}. Leia com atenção.\n\n` +
        "Ao tocar em *Assinar*, você declara que leu e concorda com o conteúdo e que esta é a sua assinatura eletrônica.",
      [
        { id: idDoBotao("assinar", envio.id, s.indice), titulo: "Assinar" },
        { id: idDoBotao("recusar", envio.id, s.indice), titulo: "Recusar" },
      ],
    );
  }

  private async pedirCpf(envio: Envio, s: Signatario): Promise<void> {
    if (s.status === "convidado" || s.status === "pendente") {
      // Tocou em "Assinar" sem ter recebido o documento (botão antigo): mostra primeiro
      await this.mostrarDocumento(envio, s);
      return;
    }
    this.banco.atualizarSignatario(envio.id, s.indice, { status: "aguardando_cpf" });
    await this.whatsapp.enviarTexto(s.telefone, "Para confirmar sua identidade, digite o seu *CPF* (só os números).");
  }

  private async recusar(envio: Envio, s: Signatario): Promise<void> {
    this.banco.atualizarSignatario(envio.id, s.indice, { status: "recusado" });
    this.banco.marcarEnvioRecusado(envio.id);
    await this.whatsapp.enviarTexto(
      s.telefone,
      `Tudo bem, registramos que você não vai assinar. Avisamos ${this.config.SENDER_DISPLAY_NAME}.`,
    );
    await this.avisos.avisar(
      envio.remetente,
      envio.titulo,
      `❌ *${s.nome}* (${s.papel}) recusou assinar *${envio.titulo}*. O envio foi encerrado.`,
    );
  }

  /** Depois de cada assinatura: avisa o escritório, convida o próximo ou finaliza. */
  private async avancar(envio: Envio, quem: Signatario): Promise<void> {
    const todos = this.banco.signatarios(envio.id);
    const faltam = todos.filter((s) => s.status !== "assinado");

    if (faltam.length === 0) {
      await this.finalizar(envio, todos);
      return;
    }

    await this.avisos.avisar(
      envio.remetente,
      envio.titulo,
      `✍️ *${quem.nome}* (${quem.papel}) assinou *${envio.titulo}*. Faltam ${faltam.length}.`,
    );

    if (envio.ordem === "sequencial") {
      const proximo = faltam[0]!;
      if (proximo.status === "pendente" && !(await this.convidar(envio, proximo))) {
        await this.avisos.avisar(
          envio.remetente,
          envio.titulo,
          `⚠️ Não consegui enviar o documento para *${proximo.nome}* (${formatarTelefone(proximo.telefone)}). Confira o número.`,
        );
      }
    }
  }

  private async finalizar(envio: Envio, signatarios: Signatario[]): Promise<void> {
    const registros: RegistroDeAssinatura[] = signatarios.map((s) => ({
      papel: s.papel,
      nome: s.nome,
      telefone: s.telefone,
      cpf: s.cpf!,
      linkEnviadoEm: s.linkEnviadoEm,
      visualizadoEm: s.visualizadoEm,
      assinadoEm: s.assinadoEm!,
      mensagemId: s.mensagemAssinaturaId ?? "",
      selfie: this.banco.selfie(envio.id, s.indice),
      lembretes: s.lembretes,
    }));
    const preenchido = await finalizarDocumento(envio.pdfApresentado, envio.blocos, {
      titulo: envio.titulo,
      codigo: envio.id,
      criadoEm: envio.criadoEm,
      hashOriginal: envio.hashOriginal,
      remetente: this.config.SENDER_DISPLAY_NAME,
      remetenteTelefone: envio.remetente,
      urlVerificacao: urlDeVerificacao(this.config.PUBLIC_URL, envio.id),
      registros,
      avancada: envio.exigeSelfie,
      comCarimboDoTempo: Boolean(this.carimbador),
      certificadoDoArquivo: this.config.SENDER_DISPLAY_NAME,
    });
    const final = await this.assinador.assinar(preenchido, `Assinaturas eletrônicas de "${envio.titulo}"`);
    this.banco.concluirEnvio(envio.id, final);
    this.banco.registrarEvento(envio.id, "concluido", { signatarios: signatarios.length });
    await this.carimbar(envio.id, final);

    const anexo = { pdf: final, nomeArquivo: nomeDeArquivo(envio.titulo, " - assinado") };
    await this.avisos.avisar(
      envio.remetente,
      envio.titulo,
      `🎉 *${envio.titulo}* foi assinado por todos. Segue a via final, com o manifesto de assinaturas.`,
      anexo,
    );
    for (const s of signatarios) {
      if (s.telefone === envio.remetente) continue;
      await this.avisos
        .avisar(s.telefone, envio.titulo, `📄 Todos assinaram *${envio.titulo}*. Segue a sua via.`, anexo)
        .catch((erro) => console.error(`Falha ao enviar a via final para ${s.telefone}:`, erro));
    }
  }
}
