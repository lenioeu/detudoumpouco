import type { Ferramenta } from '../tipos';

export default [
  { slug: 'assinatura-de-email', nome: 'Assinatura de e-mail', resumo: 'Assinatura com foto, logo e redes sociais para Gmail e Outlook.', status: 'pronta' },
  { slug: 'gerador-de-curriculo', nome: 'Gerador de currículo', resumo: 'Monte seu currículo e baixe em PDF.', status: 'planejada' },
  { slug: 'gerador-de-recibo', nome: 'Gerador de recibo', resumo: 'Recibo pronto em PDF, com valor por extenso.', status: 'planejada' },
  { slug: 'gerador-de-orcamento', nome: 'Gerador de orçamento', resumo: 'Orçamento profissional em PDF.', status: 'planejada' },
  { slug: 'convite', nome: 'Gerador de convite', resumo: 'Convite de aniversário ou casamento.', status: 'planejada' },
  { slug: 'cartao-de-visita', nome: 'Cartão de visita', resumo: 'Cartão de visita para imprimir.', status: 'planejada' },
  { slug: 'etiquetas', nome: 'Etiquetas para imprimir', resumo: 'Folha de etiquetas com seu texto.', status: 'planejada' },
] satisfies Ferramenta[];
