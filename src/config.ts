export const SITE = {
  nome: 'Quebragalho',
  url: 'https://oquebragalho.app',
  slogan: 'Ferramentas grátis que resolvem na hora',
  descricao:
    'Calculadoras, conversores e ferramentas de PDF, imagem, vídeo e áudio. Grátis, sem cadastro, e seus arquivos não saem do seu computador.',
  // TODO(dono): criar este e-mail antes de pedir o AdSense.
  email: 'contato@oquebragalho.app',
  // ID da conta do AdSense. Com ele, o código do AdSense entra no <head> de todas as páginas
  // (necessário para verificar o site e para os anúncios automáticos).
  adsenseClient: 'ca-pub-4412739787805429' as string | null,
  // IDs dos blocos de anúncio criados no painel do AdSense (Anúncios > Por bloco de anúncios).
  // Enquanto forem null, os espaços reservados nas páginas ficam vazios.
  adsenseSlots: {
    /** Logo abaixo da ferramenta. */
    meio: null as string | null,
    /** No fim da página. */
    fim: null as string | null,
  },
};
