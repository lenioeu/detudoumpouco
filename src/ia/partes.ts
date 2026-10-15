import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { EsquemaAnalise, INSTRUCOES, type Analise } from "./esquema.js";

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

export { EsquemaAnalise, type Analise } from "./esquema.js";
