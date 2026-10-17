// Blocos da página inicial, na ordem em que aparecem.
// "secao" leva à página da seção; "ferramenta" leva direto a uma ferramenta muito procurada.
// Só aparecem se a seção tiver ferramenta pronta / se a ferramenta estiver pronta.

export type Destaque =
  | { tipo: 'secao'; slug: string; descricao: string; /** Nome no bloco, se diferente do nome da seção. */ nome?: string }
  | { tipo: 'ferramenta'; secao: string; slug: string; icone: string; descricao: string };

export const DESTAQUES: Destaque[] = [
  { tipo: 'secao', slug: 'pdf', nome: 'Ferramentas de PDF', descricao: 'Juntar, dividir, comprimir e converter PDF, direto no navegador.' },
  { tipo: 'secao', slug: 'qr-code', nome: 'QR Code e Pix', descricao: 'Gere QR Code de link, Wi-Fi, WhatsApp e Pix, ou leia um QR Code.' },
  { tipo: 'secao', slug: 'calculadoras', descricao: 'Porcentagem, juros, investimentos, combustível e mais.' },
  { tipo: 'ferramenta', secao: 'calculadoras', slug: 'financiamento', icone: 'financiamento', descricao: 'Parcelas pela tabela Price e SAC, com gráfico do saldo.' },
  { tipo: 'ferramenta', secao: 'calculadoras', slug: 'amortizacao', icone: 'amortizacao', descricao: 'Veja quanto economiza pagando a mais no financiamento.' },
  { tipo: 'secao', slug: 'imagem', descricao: 'Comprima, converta, recorte e redimensione fotos.' },
  { tipo: 'secao', slug: 'conversores', descricao: 'Unidades de medida e números por extenso.' },
  { tipo: 'ferramenta', secao: 'documentos', slug: 'assinatura-de-email', icone: 'documentos', descricao: 'Assinatura profissional com foto, logo e redes sociais.' },
  { tipo: 'secao', slug: 'texto', descricao: 'Contador de caracteres e outras ferramentas de texto.' },
  { tipo: 'secao', slug: 'sorteios', descricao: 'Sorteie nomes e números de forma justa.' },
  { tipo: 'secao', slug: 'tempo', descricao: 'Cronômetro com voltas e timer com alarme.' },
];
