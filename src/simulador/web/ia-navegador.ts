import { type Ajuste, EsquemaAjuste, EsquemaAnalise, INSTRUCOES, type Analise, type ParteParaAjuste, promptDeAjuste } from "../../ia/esquema.js";
import { IaDeDemonstracao } from "../ia-demonstracao.js";

/** Função `sample` do artifact: pergunta ao Claude usando a conta de quem abriu a página. */
export type Sample = {
  json<T = unknown>(input: string, options?: { modelTier?: "quick" | "default" | "complex"; cache?: boolean }): Promise<T>;
};

/** Extrai o texto de um PDF (feito com pdf.js na página). */
export type ExtratorDeTexto = (pdf: Uint8Array) => Promise<string>;

/** Limite de texto enviado ao Claude (o pedido aceita até 256 KB). */
const LIMITE_DE_TEXTO = 120_000;

const FORMATO = `Responda somente com um objeto JSON, sem texto antes ou depois, neste formato:
{
  "titulo": "título curto do documento",
  "tipo_documento": "procuração, contrato de honorários, declaração...",
  "partes": [{ "papel": "outorgante", "nome": "Nome Completo ou null se estiver em branco" }],
  "ordem": "sequencial" ou "simultanea",
  "observacao": "o que conferir antes de enviar, ou null"
}`;

/**
 * A mesma análise do bot, mas feita pelo Claude da conta de quem abre o simulador.
 * Se a pessoa não permitir o uso do Claude, cai no modo demonstração.
 */
export class IaNoNavegador {
  private readonly demonstracao = new IaDeDemonstracao();
  private recusado = false;

  constructor(
    private readonly sample: Sample | null,
    private readonly extrairTexto: ExtratorDeTexto,
    private readonly aoMudarModo: (modo: "claude" | "demonstracao", motivo?: string) => void,
  ) {}

  get usaClaude(): boolean {
    return this.sample !== null && !this.recusado;
  }

  async analisar(pdf: Uint8Array): Promise<Analise> {
    if (!this.usaClaude) return this.demonstracao.analisar();
    const texto = await this.textoDoDocumento(pdf);
    if (!texto) {
      const analise = await this.demonstracao.analisar();
      return {
        ...analise,
        observacao:
          "Este PDF não tem texto selecionável (parece digitalizado), então a IA não conseguiu lê-lo. Toque em Corrigir e escreva as partes, ex.: outorgante: Maria da Silva; outorgado: João Pereira",
      };
    }
    return this.perguntar(`${INSTRUCOES}\n\nIdentifique as partes que devem assinar o documento abaixo.\n\n${FORMATO}\n\nDOCUMENTO:\n${texto}`, () =>
      this.demonstracao.analisar(),
    );
  }

  async corrigir(pdf: Uint8Array, anterior: Analise, correcao: string): Promise<Analise> {
    if (!this.usaClaude) return this.demonstracao.corrigir(pdf, anterior, correcao);
    const texto = await this.textoDoDocumento(pdf);
    return this.perguntar(
      `${INSTRUCOES}\n\nEsta foi a sua análise anterior do documento:\n${JSON.stringify(anterior, null, 2)}\n\n` +
        `O advogado pediu esta correção:\n"${correcao}"\n\nDevolva a análise completa já corrigida. A palavra do advogado prevalece sobre a sua leitura do documento.\n\n` +
        `${FORMATO}\n\nDOCUMENTO:\n${texto || "(sem texto selecionável)"}`,
      () => this.demonstracao.corrigir(pdf, anterior, correcao),
    );
  }

  async ajustarSignatarios(partes: ParteParaAjuste[], mensagem: string): Promise<Ajuste> {
    if (!this.usaClaude) return this.demonstracao.ajustarSignatarios(partes, mensagem);
    try {
      const resposta = EsquemaAjuste.safeParse(await this.sample!.json(promptDeAjuste(partes, mensagem), { modelTier: "quick" }));
      return resposta.success ? resposta.data : { excluir: [], entendeu: false };
    } catch {
      return this.demonstracao.ajustarSignatarios(partes, mensagem);
    }
  }

  private async perguntar(prompt: string, alternativa: () => Promise<Analise>): Promise<Analise> {
    try {
      const resposta = await this.sample!.json(prompt, { modelTier: "default" });
      const analise = EsquemaAnalise.safeParse(resposta);
      if (!analise.success) throw new Error("A IA devolveu uma análise em formato inesperado.");
      return analise.data;
    } catch (erro) {
      const codigo = (erro as { code?: string }).code;
      if (codigo === "not_granted" || codigo === "sampling_disabled" || codigo === "not_declared") {
        this.recusado = true;
        this.aoMudarModo("demonstracao", "O uso do Claude não foi permitido nesta página.");
        return alternativa();
      }
      throw erro;
    }
  }

  private async textoDoDocumento(pdf: Uint8Array): Promise<string> {
    const texto = (await this.extrairTexto(pdf)).replace(/[ \t]+/g, " ").trim();
    return texto.slice(0, LIMITE_DE_TEXTO);
  }
}
