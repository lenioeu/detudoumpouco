import type { Ferramenta } from '../tipos';

export default [
  { slug: 'porcentagem', nome: 'Calculadora de porcentagem', resumo: 'Quanto é X% de um valor, aumentos, descontos e variação.', status: 'pronta' },
  { slug: 'juros-compostos', nome: 'Juros compostos', resumo: 'Quanto seu dinheiro rende com aportes mensais.', status: 'pronta' },
  { slug: 'financiamento', nome: 'Simulador de financiamento', resumo: 'Parcelas pela tabela Price e SAC.', status: 'pronta' },
  { slug: 'amortizacao', nome: 'Simulador de amortização', resumo: 'Quanto economiza pagando a mais no financiamento.', status: 'pronta' },
  { slug: 'quanto-rende', nome: 'Quanto rende', resumo: 'Poupança, CDB e Tesouro lado a lado.', status: 'pronta' },
  { slug: 'regra-de-tres', nome: 'Regra de três', resumo: 'Simples e composta, com o passo a passo.', status: 'pronta' },
  { slug: 'alcool-ou-gasolina', nome: 'Álcool ou gasolina?', resumo: 'Descubra qual compensa mais no seu carro.', status: 'pronta' },
  { slug: 'salario-liquido', nome: 'Salário líquido', resumo: 'Descontos de INSS e IR no seu salário.', status: 'planejada' },
  { slug: 'hora-extra', nome: 'Hora extra', resumo: 'Valor das horas extras a 50% e 100%.', status: 'planejada' },
  { slug: 'preco-de-venda', nome: 'Preço de venda', resumo: 'Preço com margem de lucro, para MEI e pequenos negócios.', status: 'planejada' },
  { slug: 'valor-hora-freelancer', nome: 'Quanto cobrar por hora', resumo: 'Valor da sua hora como freelancer.', status: 'planejada' },
  { slug: 'vale-a-pena-parcelar', nome: 'Vale a pena parcelar?', resumo: 'À vista com desconto ou parcelado.', status: 'planejada' },
  { slug: 'dividir-conta', nome: 'Dividir a conta', resumo: 'Divida a conta do bar com os 10% do garçom.', status: 'planejada' },
  { slug: 'materiais-de-obra', nome: 'Materiais de obra', resumo: 'Tinta, piso, tijolo e concreto para a sua obra.', status: 'planejada' },
  { slug: 'consumo-de-energia', nome: 'Consumo de energia', resumo: 'Quanto cada aparelho pesa na conta de luz.', status: 'planejada' },
  { slug: 'dias-entre-datas', nome: 'Dias entre datas', resumo: 'Quantos dias, semanas e meses entre duas datas.', status: 'planejada' },
  { slug: 'idade', nome: 'Calculadora de idade', resumo: 'Idade exata em anos, meses e dias.', status: 'planejada' },
  { slug: 'dias-uteis', nome: 'Dias úteis', resumo: 'Dias úteis entre datas, com feriados nacionais.', status: 'planejada' },
  { slug: 'contagem-regressiva', nome: 'Contagem regressiva', resumo: 'Quanto falta para uma data.', status: 'planejada' },
] satisfies Ferramenta[];
