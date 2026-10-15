import type { Analise } from "../ia/partes.js";

/**
 * Substitui a IA quando não há chave da Anthropic: não lê o documento, só propõe duas
 * partes em branco. A correção aceita o formato "papel: nome", uma parte por linha ou
 * separadas por ponto e vírgula.
 */
export class IaDeDemonstracao {
  async analisar(): Promise<Analise> {
    return {
      titulo: "Documento de teste",
      tipo_documento: "documento",
      partes: [
        { papel: "parte 1", nome: null },
        { papel: "parte 2", nome: null },
      ],
      ordem: "sequencial",
      observacao:
        "Modo demonstração: sem a chave da Anthropic, o documento não é lido. Toque em Corrigir e escreva as partes, ex.: outorgante: Maria da Silva; outorgado: João Pereira",
    };
  }

  async corrigir(_pdf: Uint8Array, anterior: Analise, correcao: string): Promise<Analise> {
    const partes = correcao
      .split(/[;\n]+/)
      .map((linha) => /^\s*([^:]+):\s*(.*\S)\s*$/.exec(linha))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ papel: m[1]!.trim(), nome: m[2]!.trim() }));
    const simultanea = /simult|qualquer ordem|ordem não importa/i.test(correcao);
    return {
      ...anterior,
      partes: partes.length ? partes : anterior.partes,
      ordem: simultanea ? "simultanea" : anterior.ordem,
      observacao: partes.length ? null : anterior.observacao,
    };
  }
}
