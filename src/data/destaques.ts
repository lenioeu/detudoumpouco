// Blocos da página inicial, na ordem em que aparecem.
// "secao" leva à página da seção; "ferramenta" leva direto a uma ferramenta muito procurada.
// Só aparecem se a seção tiver ferramenta pronta / se a ferramenta estiver pronta.

export type Destaque =
  | { tipo: 'secao'; slug: string; descricao: string }
  | { tipo: 'ferramenta'; secao: string; slug: string; icone: string; descricao: string };

export const DESTAQUES: Destaque[] = [
  { tipo: 'secao', slug: 'calculadoras', descricao: 'Porcentagem, juros, investimentos, combustível e mais.' },
  { tipo: 'secao', slug: 'pdf', descricao: 'Ferramentas para juntar, dividir, converter e editar PDF.' },
  { tipo: 'ferramenta', secao: 'pdf', slug: 'juntar-pdf', icone: 'juntar', descricao: 'Una vários PDFs em um só arquivo, na ordem que quiser.' },
  { tipo: 'ferramenta', secao: 'calculadoras', slug: 'financiamento', icone: 'financiamento', descricao: 'Parcelas pela tabela Price e SAC, com gráfico do saldo.' },
  { tipo: 'ferramenta', secao: 'calculadoras', slug: 'amortizacao', icone: 'amortizacao', descricao: 'Veja quanto economiza pagando a mais no financiamento.' },
  { tipo: 'ferramenta', secao: 'qr-code', slug: 'gerador', icone: 'qr-code', descricao: 'QR Code grátis para link, texto, Wi-Fi ou WhatsApp.' },
  { tipo: 'secao', slug: 'imagem', descricao: 'Comprima, converta, recorte e redimensione fotos.' },
  { tipo: 'secao', slug: 'qr-code', descricao: 'Gerar e ler QR Code, inclusive Pix, Wi-Fi e WhatsApp.' },
  { tipo: 'secao', slug: 'conversores', descricao: 'Unidades de medida e números por extenso.' },
  { tipo: 'secao', slug: 'texto', descricao: 'Contador de caracteres e outras ferramentas de texto.' },
  { tipo: 'secao', slug: 'sorteios', descricao: 'Sorteie nomes e números de forma justa.' },
  { tipo: 'secao', slug: 'tempo', descricao: 'Cronômetro com voltas e timer com alarme.' },
];
