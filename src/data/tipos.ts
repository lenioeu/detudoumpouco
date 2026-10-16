export interface Ferramenta {
  /** Parte final da URL: /<secao>/<slug> */
  slug: string;
  nome: string;
  /** Uma frase, aparece nos cartões e na lista de relacionadas. */
  resumo: string;
  /** "pronta" aparece no site; "planejada" é só o plano de trabalho. */
  status: 'pronta' | 'planejada';
}
