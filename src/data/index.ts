import { SECOES, type Secao } from './secoes';
import type { Ferramenta } from './tipos';

// Cada seção tem seu próprio arquivo em ./ferramentas/<secao>.ts,
// para que cada agente mexa só no arquivo da sua seção.
const modulos = import.meta.glob<{ default: Ferramenta[] }>('./ferramentas/*.ts', { eager: true });

export interface FerramentaCompleta extends Ferramenta {
  secao: string;
  url: string;
}

export const FERRAMENTAS: FerramentaCompleta[] = Object.entries(modulos).flatMap(([arquivo, mod]) => {
  const secao = arquivo.replace('./ferramentas/', '').replace('.ts', '');
  return mod.default.map((f) => ({ ...f, secao, url: `/${secao}/${f.slug}` }));
});

export const prontas = (secao?: string) =>
  FERRAMENTAS.filter((f) => f.status === 'pronta' && (!secao || f.secao === secao));

/** Seções que já têm pelo menos uma ferramenta pronta (só essas aparecem no site). */
export const secoesAtivas = (): Secao[] => SECOES.filter((s) => prontas(s.slug).length > 0);

export const secaoPorSlug = (slug: string) => SECOES.find((s) => s.slug === slug);

export const ferramenta = (secao: string, slug: string) =>
  FERRAMENTAS.find((f) => f.secao === secao && f.slug === slug);
