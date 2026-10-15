import type { Botao } from "../whatsapp/cliente.js";

/** Uma mensagem exibida no simulador, num dos celulares. */
export type MensagemSimulada = {
  id: string;
  telefone: string;
  /** "bot": o bot mandou para o telefone; "pessoa": o telefone mandou para o bot. */
  direcao: "bot" | "pessoa";
  texto?: string;
  botoes?: Botao[];
  arquivo?: { id: string; nome: string };
  template?: string;
  em: string;
};

/**
 * Faz o papel da API do WhatsApp: em vez de chamar a Meta, guarda as mensagens
 * para a página do simulador mostrar.
 */
export class WhatsAppSimulado {
  readonly mensagens: MensagemSimulada[] = [];
  private readonly ouvintes = new Set<(m: MensagemSimulada) => void>();
  private readonly arquivos = new Map<string, { nome: string; dados: Uint8Array }>();
  private n = 0;

  async enviarTexto(para: string, texto: string): Promise<string> {
    return this.registrar({ telefone: para, direcao: "bot", texto });
  }

  async enviarBotoes(para: string, texto: string, botoes: Botao[]): Promise<string> {
    return this.registrar({ telefone: para, direcao: "bot", texto, botoes });
  }

  async enviarDocumento(para: string, pdf: Uint8Array, nomeArquivo: string, legenda?: string): Promise<string> {
    const arquivo = this.guardarArquivo(nomeArquivo, pdf);
    return this.registrar({ telefone: para, direcao: "bot", arquivo, ...(legenda ? { texto: legenda } : {}) });
  }

  /** Mostra o template como a Meta mostraria, com os parâmetros já preenchidos. */
  async enviarTemplate(para: string, nome: string, parametros: string[], payloadBotao?: string): Promise<string> {
    const textos: Record<string, (p: string[]) => string> = {
      solicitacao_assinatura: (p) =>
        `Olá, ${p[0]}! ${p[1]} enviou o documento "${p[2]}" para você assinar eletronicamente. Toque no botão abaixo para ver o documento.`,
      aviso_assinatura: (p) => `Atualização sobre o documento "${p[0]}": ${p[1]}. Responda esta mensagem para receber os detalhes.`,
    };
    const texto = textos[nome]?.(parametros) ?? `[template ${nome}] ${parametros.join(" | ")}`;
    return this.registrar({
      telefone: para,
      direcao: "bot",
      texto,
      template: nome,
      ...(payloadBotao ? { botoes: [{ id: payloadBotao, titulo: "Ver documento" }] } : {}),
    });
  }

  async baixarMidia(mediaId: string): Promise<Uint8Array> {
    const arquivo = this.arquivos.get(mediaId);
    if (!arquivo) throw new Error(`Arquivo ${mediaId} não encontrado`);
    return arquivo.dados;
  }

  guardarArquivo(nome: string, dados: Uint8Array): { id: string; nome: string } {
    const id = `arq${++this.n}`;
    this.arquivos.set(id, { nome, dados });
    return { id, nome };
  }

  arquivo(id: string): { nome: string; dados: Uint8Array } | undefined {
    return this.arquivos.get(id);
  }

  /** Chama `ouvinte` a cada mensagem nova; devolve a função que para de ouvir. */
  aoReceber(ouvinte: (m: MensagemSimulada) => void): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }

  /** Registra o que a pessoa mandou, para aparecer no celular dela. */
  registrarDaPessoa(m: Omit<MensagemSimulada, "id" | "direcao" | "em">): string {
    return this.registrar({ ...m, direcao: "pessoa" });
  }

  private registrar(m: Omit<MensagemSimulada, "id" | "em">): string {
    const mensagem: MensagemSimulada = { ...m, id: `wamid.SIM${++this.n}`, em: new Date().toISOString() };
    this.mensagens.push(mensagem);
    for (const ouvinte of this.ouvintes) ouvinte(mensagem);
    return mensagem.id;
  }
}
