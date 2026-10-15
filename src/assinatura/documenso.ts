import type { Config } from "../config.js";
import type { CampoPosicionado } from "./pagina.js";

export type NovoEnvio = {
  titulo: string;
  /** Identificador nosso, devolvido pelo Documenso nos webhooks. */
  idExterno: string;
  ordem: "sequencial" | "simultanea";
  signatarios: { nome: string; email: string }[];
  pdf: Uint8Array;
  campos: CampoPosicionado[];
};

export type EnvioCriado = {
  documentoId: number;
  signatarios: { recipientId: number; email: string; token: string; signingUrl: string }[];
};

/**
 * Cliente da API v1 do Documenso (instalado em servidor próprio).
 * Referência: packages/api/v1/contract.ts no repositório documenso/documenso.
 */
export class Documenso {
  constructor(private readonly config: Config) {}

  async criarEEnviar(envio: NovoEnvio): Promise<EnvioCriado> {
    const sequencial = envio.ordem === "sequencial";

    const criado = (await this.api("POST", "/api/v1/documents", {
      title: envio.titulo,
      externalId: envio.idExterno,
      recipients: envio.signatarios.map((s, i) => ({
        name: s.nome,
        email: s.email,
        role: "SIGNER",
        ...(sequencial ? { signingOrder: i + 1 } : {}),
      })),
      meta: {
        subject: envio.titulo,
        message: "Documento enviado para assinatura pelo WhatsApp.",
        timezone: "America/Sao_Paulo",
        dateFormat: "dd/MM/yyyy",
        language: "pt-BR",
        signingOrder: sequencial ? "SEQUENTIAL" : "PARALLEL",
        // Nada de e-mail: os links vão pelo WhatsApp
        distributionMethod: "NONE",
      },
    })) as {
      documentId: number;
      uploadUrl: string;
      recipients: { recipientId: number; email: string; token: string; signingUrl: string }[];
    };

    const upload = await fetch(criado.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.from(envio.pdf),
    });
    if (!upload.ok) throw new Error(`Documenso: falha no upload do PDF (${upload.status})`);

    // O Documenso devolve os signatários na ordem enviada; casamos pelo e-mail por segurança
    const porEmail = new Map(criado.recipients.map((r) => [r.email.toLowerCase(), r]));
    const signatarios = envio.signatarios.map((s) => {
      const r = porEmail.get(s.email.toLowerCase());
      if (!r) throw new Error(`Documenso não devolveu o signatário ${s.email}`);
      return r;
    });

    await this.api(
      "POST",
      `/api/v1/documents/${criado.documentId}/fields`,
      envio.campos.map((c) => ({
        recipientId: signatarios[c.signatario]!.recipientId,
        type: c.tipo,
        pageNumber: c.pagina,
        pageX: c.x,
        pageY: c.y,
        pageWidth: c.largura,
        pageHeight: c.altura,
        fieldMeta: c.tipo === "SIGNATURE" ? { type: "signature", required: true } : { type: "date" },
      })),
    );

    await this.api("POST", `/api/v1/documents/${criado.documentId}/send`, {
      sendEmail: false,
      sendCompletionEmails: false,
    });

    return { documentoId: criado.documentId, signatarios };
  }

  /** PDF final, já com as assinaturas e o certificado de assinatura do Documenso. */
  async baixarAssinado(documentoId: number): Promise<Uint8Array> {
    const { downloadUrl } = (await this.api("GET", `/api/v1/documents/${documentoId}/download`)) as {
      downloadUrl: string;
    };
    const resposta = await fetch(downloadUrl);
    if (!resposta.ok) throw new Error(`Documenso: falha ao baixar o PDF assinado (${resposta.status})`);
    return new Uint8Array(await resposta.arrayBuffer());
  }

  private async api(metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<unknown> {
    const resposta = await fetch(`${this.config.DOCUMENSO_URL}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${this.config.DOCUMENSO_API_TOKEN}`,
        ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
    const texto = await resposta.text();
    if (!resposta.ok) throw new Error(`Documenso ${metodo} ${caminho} -> ${resposta.status}: ${texto.slice(0, 500)}`);
    return texto ? JSON.parse(texto) : {};
  }
}
