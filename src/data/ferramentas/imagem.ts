import type { Ferramenta } from '../tipos';

export default [
  { slug: 'comprimir-imagem', nome: 'Comprimir imagem', resumo: 'Diminua o tamanho de fotos JPG, PNG e WebP.', status: 'pronta' },
  { slug: 'heic-para-jpg', nome: 'HEIC para JPG', resumo: 'Converta fotos do iPhone para JPG.', status: 'pronta' },
  { slug: 'redimensionar-imagem', nome: 'Redimensionar imagem', resumo: 'Mude a largura e a altura de uma imagem.', status: 'pronta' },
  { slug: 'recortar-imagem', nome: 'Recortar imagem', resumo: 'Corte a imagem no tamanho que quiser.', status: 'planejada' },
  { slug: 'converter-imagem', nome: 'Converter imagem', resumo: 'PNG, JPG e WebP, de um para o outro.', status: 'planejada' },
  { slug: 'remover-fundo', nome: 'Remover fundo', resumo: 'Tire o fundo de fotos automaticamente.', status: 'planejada' },
  { slug: 'imagem-para-texto', nome: 'Imagem para texto (OCR)', resumo: 'Copie o texto de uma foto ou print.', status: 'planejada' },
  { slug: 'foto-3x4', nome: 'Foto 3x4', resumo: 'Monte uma folha de fotos 3x4 para imprimir.', status: 'planejada' },
  { slug: 'borrar-imagem', nome: 'Borrar rosto ou placa', resumo: 'Esconda partes de uma imagem.', status: 'planejada' },
  { slug: 'gerador-de-favicon', nome: 'Gerador de favicon', resumo: 'Crie o ícone do seu site.', status: 'planejada' },
  { slug: 'gerador-de-meme', nome: 'Gerador de meme', resumo: 'Escreva texto em cima de uma imagem.', status: 'planejada' },
] satisfies Ferramenta[];
