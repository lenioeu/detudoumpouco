import type { Ajuste, Analise, ParteParaAjuste } from "../ia/esquema.js";
import { normalizar } from "../assinatura/linhas.js";

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

  /**
   * Entende só frases simples: "só/somente/apenas FULANO assina" e
   * "FULANO já assinou / não vai assinar / não assina", "sem FULANO".
   */
  async ajustarSignatarios(partes: ParteParaAjuste[], mensagem: string): Promise<Ajuste> {
    const texto = normalizar(mensagem);
    const citadas = partes.filter((p) => p.nome && normalizar(p.nome).split(" ").some((t) => t.length > 2 && texto.split(" ").includes(t)));
    if (/\b(SO|SOMENTE|APENAS)\b/.test(texto) && citadas.length) {
      return { excluir: partes.filter((p) => !citadas.includes(p)).map((p) => p.indice), entendeu: true };
    }
    if (/(JA ASSINOU|NAO VAI ASSINAR|NAO ASSINA|NAO PRECISA ASSINAR|\bSEM\b)/.test(texto) && citadas.length) {
      return { excluir: citadas.map((p) => p.indice), entendeu: true };
    }
    return { excluir: [], entendeu: false };
  }
}
