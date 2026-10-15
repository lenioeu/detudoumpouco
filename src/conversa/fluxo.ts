import { randomUUID } from "node:crypto";
import type { Envio, Repositorio } from "../banco.js";
import type { Config } from "../config.js";
import { encontrarLinhasDeAssinatura, type LeitorDeTexto, type LinhaDeAssinatura, normalizar } from "../assinatura/linhas.js";
import { prepararDocumento } from "../assinatura/pagina.js";
import type { Analise, IdentificadorDePartes } from "../ia/partes.js";
import { normalizarTelefone } from "../telefone.js";
import type { MensagemRecebida, StatusMensagem } from "../whatsapp/webhook.js";
import type { Avisador, Filas, Mensageiro } from "./avisos.js";
import { BOTOES, type Estado, type ParteComContato } from "./estado.js";
import { type ColetaDeAssinaturas, lerBotao } from "./signatario.js";
import { AJUDA, listaDeDocumentos, listaDePartes, pedidoDeContatos, resumoParaEnvio } from "./textos.js";

type Identificador = Pick<IdentificadorDePartes, "analisar" | "corrigir" | "ajustarSignatarios">;

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
    /** Lê o texto do PDF para achar as linhas de assinatura; sem ele, só a página de assinaturas é carimbada. */
    private readonly lerTexto?: LeitorDeTexto,
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

        // Etapas de uma assinatura em andamento (para o escritório, só fora de outro processo)
        const livre = !ehEscritorio || this.banco.lerConversa(m.de).estado.etapa === "inicio";
        if (m.tipo === "imagem") {
          const esperandoSelfie = this.banco.aguardandoSelfie(m.de);
          if (esperandoSelfie) {
            await this.coleta.tratarSelfie(esperandoSelfie, m.id, m.mediaId, m.mimeType);
            return;
          }
        }
        if (m.tipo === "texto" && livre) {
          const esperandoCpf = this.banco.aguardandoCpf(m.de);
          if (esperandoCpf) {
            await this.coleta.tratarCpf(esperandoCpf, m.id, m.texto);
            return;
          }
          const esperandoSelfie = this.banco.aguardandoSelfie(m.de);
          if (esperandoSelfie && !(ehEscritorio && PEDIDO_DE_STATUS.test(m.texto.trim()))) {
            await this.coleta.lembrarSelfie(esperandoSelfie);
            return;
          }
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

    // Situação dos documentos enviados, a qualquer momento
    if ((m.tipo === "texto" && PEDIDO_DE_STATUS.test(m.texto.trim())) || (m.tipo === "botao" && m.botaoId === BOTOES.verDocumentos.id)) {
      await this.listarDocumentos(de);
      return;
    }

    // Um PDF novo sempre recomeça o processo
    if (m.tipo === "documento") {
      await this.receberDocumento(de, m.mediaId, m.mimeType, m.nomeArquivo);
      return;
    }

    switch (estado.etapa) {
      case "inicio":
        await this.whatsapp.enviarBotoes(de, AJUDA, [BOTOES.verDocumentos]);
        return;

      case "confirmando_partes":
        if (m.tipo === "botao" && m.botaoId === BOTOES.confirmarPartes.id) {
          if (estado.analise.partes.length === 0) {
            this.banco.salvarConversa(de, { ...estado, etapa: "corrigindo_partes" });
            await this.whatsapp.enviarTexto(de, "Não encontrei ninguém para assinar. Escreva quem são as partes.");
            return;
          }
          await this.iniciarColeta(de, estado.nomeArquivo, estado.analise, m.nomePerfil);
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
        await this.receberContatos(de, estado, m);
        return;

      case "confirmando_exclusao": {
        const { excluir, ...resto } = estado;
        const coleta: ColetaEmAndamento = { ...resto, etapa: "coletando_contatos" };
        if (m.tipo === "botao" && m.botaoId === BOTOES.confirmarExclusao.id) {
          await this.continuarColeta(de, { ...coleta, excluidas: [...coleta.excluidas, ...excluir] }, null);
        } else if (m.tipo === "botao" && m.botaoId === BOTOES.negarExclusao.id) {
          this.banco.salvarConversa(de, coleta);
          await this.pedirContatos(de, coleta, null);
        } else {
          await this.receberContatos(de, coleta, m);
        }
        return;
      }

      case "escolhendo_selfie":
        if (m.tipo === "botao" && (m.botaoId === BOTOES.pedirSelfie.id || m.botaoId === BOTOES.semSelfie.id)) {
          const selfie = m.botaoId === BOTOES.pedirSelfie.id;
          this.banco.salvarConversa(de, { ...estado, etapa: "confirmando_envio", selfie });
          await this.whatsapp.enviarBotoes(de, resumoParaEnvio(estado.analise, estado.contatos, selfie), [BOTOES.enviar, BOTOES.cancelar]);
        } else {
          await this.perguntarSelfie(de);
        }
        return;

      case "confirmando_envio":
        if (m.tipo === "botao" && m.botaoId === BOTOES.enviar.id) {
          if (!pdf) throw new Error("PDF da conversa não encontrado");
          await this.enviarParaAssinatura(de, estado.nomeArquivo, estado.analise, estado.contatos, estado.selfie ?? false, pdf);
        } else {
          await this.whatsapp.enviarBotoes(de, resumoParaEnvio(estado.analise, estado.contatos, estado.selfie ?? false), [
            BOTOES.enviar,
            BOTOES.cancelar,
          ]);
        }
        return;
    }
  }

  private async listarDocumentos(de: string): Promise<void> {
    const envios = this.banco.enviosDoRemetente(de, 10).map((envio) => ({ envio, signatarios: this.banco.signatarios(envio.id) }));
    await this.whatsapp.enviarTexto(de, listaDeDocumentos(envios));
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

  // ---------------------------------------------------------------- coleta dos contatos

  /** Começa a coleta; se o advogado for uma das partes, já o preenche com o próprio número. */
  private async iniciarColeta(de: string, nomeArquivo: string, analise: Analise, nomePerfil?: string): Promise<void> {
    const contatos: (ParteComContato | null)[] = analise.partes.map(() => null);
    const nomeDoAdvogado = this.config.NOMES_DOS_REMETENTES[de] ?? nomePerfil;
    const reconhecido = nomeDoAdvogado ? parteDoAdvogado(analise.partes, nomeDoAdvogado) : null;
    if (reconhecido !== null) {
      const parte = analise.partes[reconhecido]!;
      contatos[reconhecido] = { papel: parte.papel, nome: parte.nome!, telefone: de };
    }
    await this.continuarColeta(de, { etapa: "coletando_contatos", nomeArquivo, analise, contatos, excluidas: [] }, reconhecido);
  }

  /** Pede o que falta ou, se já tem todos os contatos, segue para a pergunta da selfie. */
  private async continuarColeta(de: string, coleta: ColetaEmAndamento, reconhecido: number | null): Promise<void> {
    const faltando = pendentes(coleta);
    if (faltando.length) {
      this.banco.salvarConversa(de, coleta);
      await this.pedirContatos(de, coleta, reconhecido);
      return;
    }
    const contatos = coleta.contatos.filter((c, i): c is ParteComContato => c !== null && !coleta.excluidas.includes(i));
    if (!contatos.length) {
      const reinicio: ColetaEmAndamento = { ...coleta, excluidas: [] };
      this.banco.salvarConversa(de, reinicio);
      await this.whatsapp.enviarTexto(de, "Assim ninguém ficaria para assinar. Vamos de novo:");
      await this.pedirContatos(de, reinicio, null);
      return;
    }
    this.banco.salvarConversa(de, { etapa: "escolhendo_selfie", nomeArquivo: coleta.nomeArquivo, analise: coleta.analise, contatos });
    await this.perguntarSelfie(de);
  }

  private async pedirContatos(de: string, coleta: ColetaEmAndamento, reconhecido: number | null): Promise<void> {
    await this.whatsapp.enviarBotoes(de, pedidoDeContatos(coleta.analise, coleta.contatos, coleta.excluidas, reconhecido), [
      BOTOES.euAssino,
      BOTOES.cancelar,
    ]);
  }

  private async perguntarSelfie(de: string): Promise<void> {
    await this.whatsapp.enviarBotoes(
      de,
      "Quer pedir a quem assina uma *selfie segurando um documento de identidade* (RG ou CNH)? Ela entra no certificado como prova a mais de identidade.",
      [BOTOES.pedirSelfie, BOTOES.semSelfie],
    );
  }

  private async receberContatos(de: string, coleta: ColetaEmAndamento, m: MensagemRecebida): Promise<void> {
    const contatos = [...coleta.contatos];
    const problemas: string[] = [];
    const livres = () => pendentes({ ...coleta, contatos });
    const preencher = (indice: number, nomeInformado: string, telefone: string) => {
      const parte = coleta.analise.partes[indice]!;
      // O nome do documento prevalece sobre o digitado (que costuma vir abreviado)
      const nome = parte.nome ?? nomeInformado.trim();
      if (!nome) {
        problemas.push(`Faltou o nome completo de quem assina como ${parte.papel}.`);
        return;
      }
      contatos[indice] = { papel: parte.papel, nome, telefone };
    };

    if (m.tipo === "botao" && m.botaoId === BOTOES.euAssino.id) {
      const indice = livres()[0];
      if (indice !== undefined) preencher(indice, "", de);
    } else if (m.tipo === "contato") {
      for (const cartao of m.contatos) {
        const telefone = cartao.telefones.map(normalizarTelefone).find((t) => t !== null);
        if (!telefone) {
          problemas.push(`O contato ${cartao.nome || "sem nome"} não tem um telefone válido.`);
          continue;
        }
        const indice = parteDoNome(coleta.analise.partes, livres(), cartao.nome) ?? livres()[0];
        if (indice !== undefined) preencher(indice, cartao.nome, telefone);
      }
    } else if (m.tipo === "texto") {
      const linhas = linhasComTelefone(m.texto);
      if (!linhas.length) {
        await this.interpretarPedido(de, coleta, m.texto);
        return;
      }
      for (const { nome, telefone } of linhas) {
        if (!telefone) {
          problemas.push(`Não reconheci o número de "${nome}". Digite com DDD, ex.: 51 99999-8888.`);
          continue;
        }
        const emBranco = livres().find((i) => !coleta.analise.partes[i]!.nome);
        const indice = (nome ? parteDoNome(coleta.analise.partes, livres(), nome) : null) ?? (nome ? emBranco : undefined) ?? livres()[0];
        if (indice !== undefined) preencher(indice, nome, telefone);
      }
    } else {
      await this.whatsapp.enviarTexto(de, "Envie os contatos da agenda ou digite nome e telefone com DDD.");
      return;
    }

    if (problemas.length) await this.whatsapp.enviarTexto(de, `⚠️ ${problemas.join("\n")}`);
    await this.continuarColeta(de, { ...coleta, contatos }, null);
  }

  /** Texto sem telefone: pode ser um pedido como "só o Carlos assina". */
  private async interpretarPedido(de: string, coleta: ColetaEmAndamento, texto: string): Promise<void> {
    const faltando = pendentes(coleta);
    const ajuste = await this.ia.ajustarSignatarios(
      faltando.map((indice) => ({ indice, papel: coleta.analise.partes[indice]!.papel, nome: coleta.analise.partes[indice]!.nome })),
      texto,
    );
    const excluir = ajuste.excluir.filter((i) => faltando.includes(i));
    if (!ajuste.entendeu || !excluir.length) {
      await this.whatsapp.enviarTexto(
        de,
        "Não entendi. Mande o nome e o telefone com DDD de quem assina (ex.: _Maria da Silva 51 99999-8888_), " +
          "ou diga quem não vai assinar (ex.: _só a Maria assina_).",
      );
      return;
    }
    this.banco.salvarConversa(de, { ...coleta, etapa: "confirmando_exclusao", excluir });
    const nomes = excluir.map((i) => {
      const p = coleta.analise.partes[i]!;
      return `*${p.nome ?? "(nome em branco)"}* (${p.papel})`;
    });
    await this.whatsapp.enviarBotoes(
      de,
      `O documento menciona ${nomes.join(" e ")} como parte. Posso seguir sem ${excluir.length > 1 ? "essas assinaturas" : "essa assinatura"}?`,
      [BOTOES.confirmarExclusao, BOTOES.negarExclusao],
    );
  }

  private async enviarParaAssinatura(
    de: string,
    nomeArquivo: string,
    analise: Analise,
    contatos: ParteComContato[],
    exigeSelfie: boolean,
    original: Uint8Array,
  ): Promise<void> {
    let linhas: LinhaDeAssinatura[] = [];
    try {
      if (this.lerTexto) linhas = encontrarLinhasDeAssinatura(await this.lerTexto(original), contatos.map((c) => c.nome));
    } catch (erro) {
      console.error("Não consegui ler o texto do PDF para achar as linhas de assinatura:", erro);
    }

    let preparado: Awaited<ReturnType<typeof prepararDocumento>>;
    try {
      preparado = await prepararDocumento(original, analise.titulo, contatos, linhas);
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
      exigeSelfie,
    };
    this.banco.criarEnvio(envio, contatos);
    this.banco.registrarEvento(envio.id, "envio_criado", { arquivo: nomeArquivo, hashOriginal: preparado.hashOriginal, exigeSelfie });
    this.banco.salvarConversa(de, { etapa: "inicio" }, null);

    const falhas = await this.coleta.iniciar(envio);
    const aviso =
      analise.ordem === "sequencial" && contatos.length > 1
        ? `Enviei para *${contatos[0]!.nome}*. Os próximos recebem assim que o anterior assinar.`
        : contatos.length > 1
          ? "Enviei para todos."
          : `Enviei para *${contatos[0]!.nome}*.`;
    const erro = falhas.length ? `\n\n⚠️ Não consegui enviar para: ${falhas.join(", ")}. Confira o número.` : "";
    await this.whatsapp.enviarTexto(
      de,
      `✅ *${analise.titulo}* enviado para assinatura.\n${aviso}\n\nEu aviso aqui a cada assinatura. Para acompanhar, escreva *documentos*.${erro}`,
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
type ColetaEmAndamento = Extract<Estado, { etapa: "coletando_contatos" }>;

/** "documentos", "status", "situação", "quem falta", "quem ainda não assinou"... */
const PEDIDO_DE_STATUS = /^(ver )?(documentos|status|situa[cç][aã]o)\??$|^quem (ainda )?(falta|n[aã]o assinou)/i;

/** Partes que ainda não têm contato e não foram dispensadas. */
function pendentes(coleta: Pick<ColetaEmAndamento, "contatos" | "excluidas">): number[] {
  return coleta.contatos.map((c, i) => (c || coleta.excluidas.includes(i) ? -1 : i)).filter((i) => i >= 0);
}

function palavras(nome: string): string[] {
  return normalizar(nome)
    .split(" ")
    .filter((p) => p.length > 2 && !["DOS", "DAS", "DES"].includes(p));
}

/** Parte cujo nome tem mais palavras em comum com o nome informado (null se nenhuma ou empate). */
export function parteDoNome(partes: Parte[], candidatas: number[], nome: string): number | null {
  const procuradas = palavras(nome);
  const pontos = candidatas
    .map((i) => ({ i, n: partes[i]!.nome ? palavras(partes[i]!.nome!).filter((p) => procuradas.includes(p)).length : 0 }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);
  if (!pontos.length || (pontos[1] && pontos[1].n === pontos[0]!.n)) return null;
  return pontos[0]!.i;
}

/** O advogado é uma das partes quando todas as palavras do nome dele (ao menos duas) estão no nome da parte. */
export function parteDoAdvogado(partes: Parte[], nomeDoAdvogado: string): number | null {
  const dele = palavras(nomeDoAdvogado);
  if (dele.length < 2) return null;
  const achadas = partes
    .map((p, i) => ({ i, nome: p.nome }))
    .filter(({ nome }) => nome && dele.every((t) => palavras(nome).includes(t)));
  return achadas.length === 1 ? achadas[0]!.i : null;
}

/** Linhas com telefone num texto livre: "Maria da Silva 51 99999-8888" (uma por linha ou separadas por ";"). */
export function linhasComTelefone(texto: string): { nome: string; telefone: string | null }[] {
  return texto
    .split(/\n|;/)
    .map((linha) => {
      const numero = linha.match(/\+?\(?\d[\d\s().-]{7,}\d/)?.[0];
      if (!numero) return null;
      const nome = linha
        .replace(numero, " ")
        .replace(/[,:\-–]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { nome, telefone: normalizarTelefone(numero) };
    })
    .filter((l): l is { nome: string; telefone: string | null } => l !== null);
}
