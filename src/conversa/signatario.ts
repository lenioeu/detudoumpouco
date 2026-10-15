import type { Envio, Repositorio, Signatario } from "../banco.js";
import type { Config } from "../config.js";
import { validarCpf } from "../cpf.js";
import type { AssinadorDePdf } from "../assinatura/certificado.js";
import { finalizarDocumento, type RegistroDeAssinatura } from "../assinatura/pagina.js";
import { urlDeVerificacao } from "../verificacao.js";
import { formatarTelefone } from "../telefone.js";
import { type Avisador, type Filas, type Mensageiro, nomeDeArquivo } from "./avisos.js";
import { primeiroNome } from "./textos.js";

/** A selfie entra no PDF final, que só aceita estes formatos de imagem. */
const TIPOS_DE_FOTO = ["image/jpeg", "image/jpg", "image/png"];
const TAMANHO_MAXIMO_SELFIE = 8 * 1024 * 1024;

/** Botões da conversa com quem assina; o id leva o envio e a posição do signatário. */
export const ACOES = ["ver", "assinar", "recusar"] as const;
export type Acao = (typeof ACOES)[number];

export function idDoBotao(acao: Acao, envioId: string, indice: number): string {
  return `${acao}:${envioId}:${indice}`;
}

export function lerBotao(id: string): { acao: Acao; envioId: string; indice: number } | null {
  const m = /^(ver|assinar|recusar):([0-9a-f-]{36}):(\d+)$/.exec(id);
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
      else await this.recusar(envioAtual, atual);
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
      if (envio.exigeSelfie) {
        this.banco.atualizarSignatario(s.envioId, s.indice, { status: "aguardando_selfie", cpf });
        this.banco.registrarEvento(s.envioId, "cpf_informado", { indice: s.indice, mensagemId });
        await this.pedirSelfie(atual.telefone);
        return;
      }
      const assinadoEm = new Date().toISOString();
      this.banco.atualizarSignatario(s.envioId, s.indice, { status: "assinado", cpf, assinadoEm, mensagemAssinaturaId: mensagemId });
      this.banco.registrarEvento(s.envioId, "assinado", { indice: s.indice, mensagemId, assinadoEm });
      await this.whatsapp.enviarTexto(
        atual.telefone,
        "✅ Assinatura registrada! Quando todos assinarem, você recebe aqui a via final do documento.",
      );
      await this.avancar(envio, atual);
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
      const assinadoEm = new Date().toISOString();
      this.banco.salvarSelfie(s.envioId, s.indice, { dados, tipo }, assinadoEm);
      this.banco.atualizarSignatario(s.envioId, s.indice, { status: "assinado", assinadoEm, mensagemAssinaturaId: mensagemId });
      this.banco.registrarEvento(s.envioId, "assinado", { indice: s.indice, mensagemId, assinadoEm, selfie: true });
      await this.whatsapp.enviarTexto(
        atual.telefone,
        "✅ Selfie recebida e assinatura registrada! Quando todos assinarem, você recebe aqui a via final do documento.",
      );
      await this.avancar(envio, atual);
    });
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

  // ---------------------------------------------------------------- etapas

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
    });
    const final = await this.assinador.assinar(preenchido, `Assinaturas eletrônicas de "${envio.titulo}"`);
    this.banco.concluirEnvio(envio.id, final);
    this.banco.registrarEvento(envio.id, "concluido", { signatarios: signatarios.length });

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
