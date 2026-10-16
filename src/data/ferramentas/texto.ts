import type { Ferramenta } from '../tipos';

export default [
  { slug: 'qr-code-pix', nome: 'QR Code Pix', resumo: 'Gere um QR Code Pix com valor para receber pagamentos.', status: 'planejada' },
  { slug: 'contador-de-caracteres', nome: 'Contador de caracteres', resumo: 'Conte caracteres, palavras e linhas.', status: 'pronta' },
  { slug: 'gerador-de-qr-code', nome: 'Gerador de QR Code', resumo: 'QR Code para link, texto ou Wi-Fi.', status: 'pronta' },
  { slug: 'fontes-para-instagram', nome: 'Fontes para Instagram', resumo: 'Letras diferentes para a sua bio.', status: 'planejada' },
  { slug: 'gerador-de-senha', nome: 'Gerador de senha', resumo: 'Senhas fortes e aleatórias.', status: 'planejada' },
  { slug: 'maiusculas-minusculas', nome: 'Maiúsculas e minúsculas', resumo: 'Converta o texto de caixa.', status: 'planejada' },
  { slug: 'validador-de-cpf', nome: 'Validador de CPF e CNPJ', resumo: 'Confira se um número é válido.', status: 'planejada' },
  { slug: 'texto-para-fala', nome: 'Texto para fala', resumo: 'Ouça qualquer texto em voz alta.', status: 'planejada' },
  { slug: 'ditado', nome: 'Ditado por voz', resumo: 'Fale e veja o texto aparecer.', status: 'planejada' },
] satisfies Ferramenta[];
