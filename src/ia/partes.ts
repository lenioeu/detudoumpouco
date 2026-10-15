import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const EsquemaAnalise = z.object({
  titulo: z.string().describe("Título curto do documento, ex.: 'Procuração ad judicia'"),
  tipo_documento: z.string().describe("Tipo do documento, ex.: procuração, contrato de honorários, declaração"),
  partes: z
    .array(
      z.object({
        papel: z.string().describe("Papel no documento, ex.: outorgante, contratante, declarante"),
        nome: z.string().nullable().describe("Nome completo como aparece no documento; null se estiver em branco"),
      }),
    )
    .describe("Quem precisa assinar, na ordem em que deve assinar"),
  ordem: z
    .enum(["sequencial", "simultanea"])
    .describe("sequencial quando uma parte define os termos e a outra aceita; simultanea quando a ordem não importa"),
  observacao: z
    .string()
    .nullable()
    .describe("Algo que o advogado deve conferir antes de enviar (campo em branco, assinatura faltando etc.); null se nada"),
});

export type Analise = z.infer<typeof EsquemaAnalise>;

const INSTRUCOES = `Você ajuda um escritório de advocacia brasileiro a enviar documentos para assinatura eletrônica pelo WhatsApp.

Leia o documento e identifique quem precisa assiná-lo.

Regras:
- Liste só quem assina como parte. Testemunhas ficam de fora: elas assinam separadamente, se o escritório quiser.
- Use o nome exatamente como está no documento. Se o nome estiver em branco ou for um campo a preencher, use null.
- Se uma pessoa jurídica assina por representante, o papel é o da empresa e o nome é o do representante, ex.: papel "contratante (Empresa X Ltda.)".
- Ordem de assinatura: quem define os termos assina primeiro (outorgante antes do outorgado, contratante antes do contratado, locador antes do locatário). Use "simultanea" só quando a ordem não fizer diferença, como em acordos mútuos.
- Na observação, aponte só o que exige atenção antes do envio: campos obrigatórios em branco, documento que parece incompleto, número de partes menor que o exigido pelo tipo de documento. Não comente o mérito jurídico.`;

export class IdentificadorDePartes {
  constructor(
    private readonly client: Anthropic,
    private readonly modelo: string,
  ) {}

  /** Lê o PDF e propõe título, partes e ordem de assinatura. */
  async analisar(pdf: Uint8Array): Promise<Analise> {
    return this.chamar([
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") },
      },
      { type: "text", text: "Identifique as partes que devem assinar este documento." },
    ]);
  }

  /** Aplica a correção que o advogado escreveu sobre a análise anterior. */
  async corrigir(pdf: Uint8Array, anterior: Analise, correcao: string): Promise<Analise> {
    return this.chamar([
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") },
      },
      {
        type: "text",
        text: `Esta foi a sua análise anterior do documento:\n${JSON.stringify(anterior, null, 2)}\n\nO advogado pediu esta correção:\n"${correcao}"\n\nDevolva a análise completa já corrigida. A palavra do advogado prevalece sobre a sua leitura do documento.`,
      },
    ]);
  }

  private async chamar(conteudo: Anthropic.Beta.BetaContentBlockParam[]): Promise<Analise> {
    const resposta = await this.client.beta.messages.parse({
      model: this.modelo,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: INSTRUCOES,
      output_config: { effort: "medium", format: betaZodOutputFormat(EsquemaAnalise) },
      messages: [{ role: "user", content: conteudo }],
    });

    if (resposta.stop_reason === "refusal") {
      throw new Error("A IA recusou analisar este documento.");
    }
    if (!resposta.parsed_output) {
      throw new Error(`A IA não devolveu uma análise válida (stop_reason: ${resposta.stop_reason}).`);
    }
    return resposta.parsed_output;
  }
}
