import type { Banco, Envio, Signatario } from "../banco.js";
import type { Config } from "../config.js";
import { validarCpf } from "../cpf.js";
import type { AssinadorDePdf } from "../assinatura/certificado.js";
import { finalizarDocumento, type RegistroDeAssinatura } from "../assinatura/pagina.js";
import { formatarTelefone } from "../telefone.js";
import { type Avisador, type Filas, type Mensageiro, nomeDeArquivo } from "./avisos.js";
import { primeiroNome } from "./textos.js";

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
    private readonly banco: Banco,
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

  // ---------------------------------------------------------------- etapas

  private async convidar(envio: Envio, s: Signatario): Promise<boolean> {
    try {
      const mensagemId = await this.whatsapp.enviarTemplate(
        s.telefone,
        this.config.WHATSAPP_TEMPLATE_SOLICITACAO,
        [primeiroNome(s.nome), this.config.SENDER_DISPLAY_NAME, envio.titulo],
        idDoBotao("ver", envio.id, s.indice),
      );
      this.banco.atualizarSignatario(envio.id, s.indice, { status: "convidado", linkEnviadoEm: new Date().toISOString() });
      this.banco.vincularMensagem(mensagemId, envio.id, s.indice);
      this.banco.registrarEvento(envio.id, "convite_enviado", { indice: s.indice, telefone: s.telefone, mensagemId });
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
    }));
    const preenchido = await finalizarDocumento(envio.pdfApresentado, envio.blocos, {
      titulo: envio.titulo,
      codigo: envio.id,
      criadoEm: envio.criadoEm,
      hashOriginal: envio.hashOriginal,
      remetente: this.config.SENDER_DISPLAY_NAME,
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
