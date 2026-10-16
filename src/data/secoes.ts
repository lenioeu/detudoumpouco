export interface Secao {
  slug: string;
  nome: string;
  /** Frase curta usada no menu e nos cartões da home. */
  resumo: string;
  /** Título e descrição da página da seção (SEO). */
  titulo: string;
  descricao: string;
}

// A ordem aqui é a ordem do menu e da home.
export const SECOES: Secao[] = [
  { slug: 'calculadoras', nome: 'Calculadoras', resumo: 'Dinheiro, trabalho, casa e datas',
    titulo: 'Calculadoras online grátis', descricao: 'Calculadoras de porcentagem, juros, financiamento, salário, combustível, obra e datas. Simples, grátis e sem cadastro.' },
  { slug: 'qr-code', nome: 'QR Code', resumo: 'Link, Wi-Fi, WhatsApp e Pix',
    titulo: 'Gerador de QR Code grátis', descricao: 'Crie QR Code grátis para link, texto, Wi-Fi, WhatsApp e Pix. Baixe em PNG ou SVG, sem cadastro e sem marca d\'água.' },
  { slug: 'pdf', nome: 'PDF', resumo: 'Juntar, dividir, converter',
    titulo: 'Ferramentas de PDF grátis', descricao: 'Junte, divida, gire e converta PDFs direto no navegador. Seus arquivos não são enviados para nenhum servidor.' },
  { slug: 'imagem', nome: 'Imagem', resumo: 'Comprimir, converter, recortar',
    titulo: 'Ferramentas de imagem grátis', descricao: 'Comprima, converta e redimensione imagens no navegador, sem enviar suas fotos para nenhum servidor.' },
  { slug: 'video', nome: 'Vídeo', resumo: 'Cortar, comprimir, extrair áudio',
    titulo: 'Ferramentas de vídeo grátis', descricao: 'Corte, comprima e converta vídeos, ou extraia o áudio em MP3, direto no navegador.' },
  { slug: 'audio', nome: 'Áudio', resumo: 'Converter, cortar, gravar',
    titulo: 'Ferramentas de áudio grátis', descricao: 'Converta áudio do WhatsApp para MP3, corte músicas, grave sua voz e mais. Tudo no navegador.' },
  { slug: 'conversores', nome: 'Conversores', resumo: 'Unidades, números, medidas',
    titulo: 'Conversores online grátis', descricao: 'Converta unidades, medidas de receita, números romanos e escreva valores por extenso.' },
  { slug: 'documentos', nome: 'Documentos', resumo: 'Currículo, recibo, orçamento',
    titulo: 'Geradores de documentos grátis', descricao: 'Crie currículo, recibo e orçamento em PDF em poucos minutos, grátis.' },
  { slug: 'texto', nome: 'Texto', resumo: 'Contador, fontes, senhas',
    titulo: 'Ferramentas de texto grátis', descricao: 'Contador de caracteres, fontes para Instagram, gerador de senha, validador de CPF e mais.' },
  { slug: 'sorteios', nome: 'Sorteios', resumo: 'Nomes, números, amigo secreto',
    titulo: 'Sorteadores online grátis', descricao: 'Sorteie nomes e números, monte times, gire a roleta e organize o amigo secreto.' },
  { slug: 'testes', nome: 'Testes', resumo: 'Microfone, webcam, teclado',
    titulo: 'Testes de dispositivo online', descricao: 'Teste microfone, webcam, alto-falantes, teclado e tela antes da sua reunião.' },
  { slug: 'tempo', nome: 'Tempo', resumo: 'Cronômetro, timer, pomodoro',
    titulo: 'Cronômetro, timer e ferramentas de tempo', descricao: 'Cronômetro, timer, pomodoro e bloco de notas online, grátis.' },
  { slug: 'consultas', nome: 'Consultas', resumo: 'CEP, dólar, feriados',
    titulo: 'Consultas rápidas grátis', descricao: 'Busque CEP, veja a cotação do dólar e consulte os feriados nacionais.' },
  { slug: 'saude', nome: 'Saúde', resumo: 'Gravidez, IMC, água',
    titulo: 'Calculadoras de saúde', descricao: 'Calculadora de gravidez, período fértil, IMC e consumo de água. Não substituem orientação médica.' },
];
