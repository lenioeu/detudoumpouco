import type { Ferramenta } from '../tipos';

export default [
  { slug: 'juntar-pdf', nome: 'Juntar PDF', resumo: 'Una vários PDFs em um só arquivo.', status: 'pronta' },
  { slug: 'jpg-para-pdf', nome: 'JPG para PDF', resumo: 'Transforme fotos e imagens em PDF.', status: 'pronta' },
  { slug: 'dividir-pdf', nome: 'Dividir PDF', resumo: 'Separe páginas ou intervalos em novos arquivos.', status: 'pronta' },
  { slug: 'pdf-para-jpg', nome: 'PDF para JPG', resumo: 'Salve cada página do PDF como imagem.', status: 'pronta' },
  { slug: 'remover-paginas', nome: 'Remover páginas do PDF', resumo: 'Apague as páginas que você não quer.', status: 'planejada' },
  { slug: 'girar-pdf', nome: 'Girar PDF', resumo: 'Gire páginas tortas ou de cabeça para baixo.', status: 'planejada' },
  { slug: 'organizar-pdf', nome: 'Organizar PDF', resumo: 'Mude a ordem das páginas arrastando.', status: 'planejada' },
  { slug: 'marca-dagua', nome: "Marca d'água em PDF", resumo: 'Adicione um texto em todas as páginas.', status: 'planejada' },
  { slug: 'numerar-paginas', nome: 'Numerar páginas', resumo: 'Coloque número nas páginas do PDF.', status: 'planejada' },
  { slug: 'comprimir-pdf', nome: 'Comprimir PDF', resumo: 'Diminua o tamanho do arquivo.', status: 'pronta' },
  { slug: 'proteger-pdf', nome: 'Proteger PDF com senha', resumo: 'Coloque senha no seu PDF.', status: 'pronta' },
  { slug: 'remover-senha-pdf', nome: 'Remover senha de PDF', resumo: 'Tire a senha de um PDF que você sabe abrir.', status: 'planejada' },
] satisfies Ferramenta[];
