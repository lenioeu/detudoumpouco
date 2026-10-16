import type { Ferramenta } from '../tipos';

export default [
  { slug: 'ogg-para-mp3', nome: 'Áudio do WhatsApp para MP3', resumo: 'Converta áudios OGG/OPUS do WhatsApp para MP3.', status: 'planejada' },
  { slug: 'transcrever-audio', nome: 'Transcrever áudio', resumo: 'Transforme um áudio em texto.', status: 'planejada' },
  { slug: 'afinador', nome: 'Afinador de violão', resumo: 'Afine pelo microfone do celular ou computador.', status: 'planejada' },
  { slug: 'converter-audio', nome: 'Converter áudio', resumo: 'MP3, WAV, OGG e M4A.', status: 'planejada' },
  { slug: 'cortar-audio', nome: 'Cortar áudio', resumo: 'Corte músicas e crie toques de celular.', status: 'planejada' },
  { slug: 'gravador-de-voz', nome: 'Gravador de voz', resumo: 'Grave sua voz e baixe o arquivo.', status: 'planejada' },
  { slug: 'aumentar-volume', nome: 'Aumentar volume', resumo: 'Deixe um áudio baixo mais alto.', status: 'planejada' },
  { slug: 'metronomo', nome: 'Metrônomo', resumo: 'Metrônomo online com BPM ajustável.', status: 'planejada' },
  { slug: 'juntar-audios', nome: 'Juntar áudios', resumo: 'Una vários áudios em um arquivo.', status: 'planejada' },
] satisfies Ferramenta[];
