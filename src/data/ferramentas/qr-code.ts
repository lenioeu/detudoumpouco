import type { Ferramenta } from '../tipos';

export default [
  { slug: 'gerador', nome: 'Gerador de QR Code', resumo: 'QR Code grátis para link, texto, Wi-Fi ou WhatsApp, em PNG e SVG.', status: 'pronta' },
  { slug: 'pix', nome: 'QR Code Pix', resumo: 'Gere um QR Code Pix com valor para receber pagamentos.', status: 'pronta' },
  { slug: 'leitor', nome: 'Leitor de QR Code', resumo: 'Leia um QR Code pela câmera ou por uma imagem.', status: 'pronta' },
  { slug: 'wifi', nome: 'QR Code de Wi-Fi', resumo: 'Visitas entram na rede sem digitar a senha.', status: 'pronta' },
  { slug: 'whatsapp', nome: 'QR Code de WhatsApp', resumo: 'QR Code que abre uma conversa no seu WhatsApp.', status: 'planejada' },
  { slug: 'com-logo', nome: 'QR Code com logo', resumo: 'QR Code com a sua logo no meio.', status: 'planejada' },
  { slug: 'cardapio', nome: 'QR Code para cardápio', resumo: 'QR Code para o cardápio do seu restaurante.', status: 'planejada' },
] satisfies Ferramenta[];
