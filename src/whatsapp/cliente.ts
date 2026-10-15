import type { Config } from "../config.js";

export type Botao = { id: string; titulo: string };

export class ErroWhatsApp extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly codigo?: number,
  ) {
    super(message);
  }
}

/**
 * Cliente mínimo da WhatsApp Business Cloud API (Graph API da Meta).
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
export class WhatsApp {
  private readonly base: string;

  constructor(private readonly config: Config) {
    this.base = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}`;
  }

  async enviarTexto(para: string, texto: string): Promise<string> {
    return this.enviar(para, { type: "text", text: { body: texto, preview_url: false } });
  }

  /** Mensagem com até 3 botões de resposta (título de cada botão: até 20 caracteres). */
  async enviarBotoes(para: string, texto: string, botoes: Botao[]): Promise<string> {
    return this.enviar(para, {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: texto },
        action: {
          buttons: botoes.map((b) => ({ type: "reply", reply: { id: b.id, title: b.titulo.slice(0, 20) } })),
        },
      },
    });
  }

  async enviarDocumento(para: string, pdf: Uint8Array, nomeArquivo: string, legenda?: string): Promise<string> {
    const mediaId = await this.subirMidia(pdf, nomeArquivo, "application/pdf");
    return this.enviar(para, {
      type: "document",
      document: { id: mediaId, filename: nomeArquivo, ...(legenda ? { caption: legenda } : {}) },
    });
  }

  /**
   * Template aprovado na Meta. É o único tipo de mensagem que pode iniciar conversa
   * com quem não falou com o número nas últimas 24 horas (caso de quem vai assinar).
   */
  async enviarTemplate(
    para: string,
    nome: string,
    parametrosCorpo: string[],
    sufixoBotaoUrl?: string,
  ): Promise<string> {
    const components: unknown[] = [
      { type: "body", parameters: parametrosCorpo.map((text) => ({ type: "text", text })) },
    ];
    if (sufixoBotaoUrl) {
      components.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: sufixoBotaoUrl }],
      });
    }
    return this.enviar(para, {
      type: "template",
      template: { name: nome, language: { code: this.config.WHATSAPP_TEMPLATE_LANGUAGE }, components },
    });
  }

  /** Baixa um arquivo recebido (documento, imagem) pelo id de mídia. */
  async baixarMidia(mediaId: string): Promise<Uint8Array> {
    const info = (await this.graph(`/${mediaId}`)) as { url: string };
    const resposta = await fetch(info.url, { headers: this.cabecalhos() });
    if (!resposta.ok) throw new ErroWhatsApp(`Falha ao baixar mídia ${mediaId}`, resposta.status);
    return new Uint8Array(await resposta.arrayBuffer());
  }

  private async subirMidia(conteudo: Uint8Array, nomeArquivo: string, tipo: string): Promise<string> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", tipo);
    form.append("file", new Blob([Buffer.from(conteudo)], { type: tipo }), nomeArquivo);
    const resposta = (await this.graph(`/${this.config.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: "POST",
      body: form,
    })) as { id: string };
    return resposta.id;
  }

  private async enviar(para: string, mensagem: Record<string, unknown>): Promise<string> {
    const resposta = (await this.graph(`/${this.config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: para, ...mensagem }),
    })) as { messages?: { id: string }[] };
    return resposta.messages?.[0]?.id ?? "";
  }

  private async graph(caminho: string, init: RequestInit = {}): Promise<unknown> {
    const resposta = await fetch(`${this.base}${caminho}`, {
      ...init,
      headers: { ...this.cabecalhos(), ...(init.headers as Record<string, string> | undefined) },
    });
    const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
    if (!resposta.ok) {
      throw new ErroWhatsApp(
        `WhatsApp API ${resposta.status}: ${corpo.error?.message ?? "erro desconhecido"}`,
        resposta.status,
        corpo.error?.code,
      );
    }
    return corpo;
  }

  private cabecalhos(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.WHATSAPP_TOKEN}` };
  }
}
