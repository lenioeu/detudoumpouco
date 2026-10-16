import type { Ferramenta } from '../tipos';

export default [
  { slug: 'video-para-mp3', nome: 'Vídeo para MP3', resumo: 'Extraia o áudio de um vídeo.', status: 'planejada' },
  { slug: 'comprimir-video', nome: 'Comprimir vídeo', resumo: 'Diminua o vídeo para mandar no WhatsApp.', status: 'planejada' },
  { slug: 'gravar-tela', nome: 'Gravar tela', resumo: 'Grave a tela do computador com áudio.', status: 'planejada' },
  { slug: 'cortar-video', nome: 'Cortar vídeo', resumo: 'Escolha o início e o fim do vídeo.', status: 'planejada' },
  { slug: 'video-para-gif', nome: 'Vídeo para GIF', resumo: 'Transforme um trecho do vídeo em GIF.', status: 'planejada' },
  { slug: 'converter-video', nome: 'Converter vídeo', resumo: 'MP4, WebM e MOV, de um para o outro.', status: 'planejada' },
  { slug: 'editar-video', nome: 'Girar, tirar som e mudar velocidade', resumo: 'Ajustes rápidos no vídeo.', status: 'planejada' },
  { slug: 'gravar-webcam', nome: 'Gravar pela webcam', resumo: 'Grave um vídeo pela câmera do computador.', status: 'planejada' },
] satisfies Ferramenta[];
