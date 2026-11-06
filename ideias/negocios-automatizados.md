# Negócios automatizados — banco de ideias

Atualizado em 06/11/2026. Objetivo: negócios recorrentes (assinatura ou similar)
que rodem com 2–4 h/semana de manutenção.

Regra geral: preferir **API oficial / dados abertos**. O reverse-api-engineer
(github.com/kalil0321/reverse-api-engineer) serve para prototipar onde não há API,
mas quebra quando o site muda e pode violar termos de uso.

---

## Em análise

### Ideia 3 — Monitor de licitações para pequenas empresas ⭐
- **Fonte:** API pública do PNCP (Portal Nacional de Contratações Públicas). Oficial, estável, sem risco jurídico.
- **Fluxo:** coleta diária → filtro por segmento/região/palavras-chave → resumo por IA
  (objeto, prazo, documentos exigidos, valor estimado) → envio por e-mail/WhatsApp.
- **Receita:** assinatura mensal B2B (empresas pagam melhor que pessoa física).
- **Diferencial:** serviço jurídico adicional (impugnação de edital, análise de habilitação, recursos).
- **Riscos:** concorrentes já existem → diferenciar por nicho (ex.: só obras, só saúde, só TI) e pela qualidade do resumo.
- **Próximo passo:** protótipo que puxa editais do dia no PNCP, filtra por palavra-chave e gera resumo.

### Ideia 4 — Catálogo / comparador de nicho
- **Exemplos:** imóveis de leilão, carros de uma região, ofertas de um segmento específico.
- **Receita:** anúncios, indicação (lead), plano premium com alertas.
- **Fonte:** onde o reverse-api mais ajuda — e onde mais quebra / tem risco de termos de uso.
- **Variação ligada à área jurídica:** agregador de leilões judiciais e extrajudiciais com
  alerta para investidores + análise de risco do imóvel (dívidas, ocupação, ônus).

---

## Outras ideias levantadas antes
1. Comunidade de achadinhos (Telegram/WhatsApp) com links de afiliado (APIs de afiliados Shopee/Amazon; Telegram tem Bot API grátis; WhatsApp canal não tem API oficial de postagem).
2. Alertas de preço por assinatura (mesmo robô, cobrança recorrente).

## Novas ideias (recorrentes)

| # | Ideia | Fonte de dados | Quem paga |
|---|-------|----------------|-----------|
| 6 | **Vigilância de marcas no INPI** — toda semana a Revista da Propriedade Industrial (RPI) é publicada; robô cruza pedidos novos com a carteira do cliente e alerta colidência/prazo de oposição | RPI (dados públicos semanais) | Empresas, escritórios, agências |
| 7 | **Monitor de Diários Oficiais** — avisa quando CNPJ, nome ou tema aparece em diário municipal/estadual | Querido Diário (API aberta) + diários oficiais | Empresas, prefeituras, escritórios |
| 8 | **Due diligence de fornecedores em lote** — situação cadastral, sanções (CEIS/CNEP), certidões; relatório mensal | Dados abertos CNPJ, Portal da Transparência (API com token gratuito) | Empresas com muitos fornecedores |
| 9 | **Leads B2B de empresas recém-abertas** — lista semanal filtrada por CNAE/cidade | Dados abertos CNPJ da Receita (mensal) | Contadores, software houses, bancos (atenção LGPD em MEI) |
| 10 | **Gestor de vencimentos** — alvarás, licenças, certificados digitais, CNH de frota, AVCB; lembretes automáticos | Dados cadastrados pelo próprio cliente | PMEs, transportadoras, clínicas |
| 11 | **Newsletter de nicho com IA** — ex.: mudanças legislativas/tributárias resumidas para contadores ou RH | Diário Oficial da União, sites oficiais | Assinatura premium + patrocínio |
| 12 | **Monitor de preços de concorrentes para lojistas** — relatório diário de preços/estoque | Sites dos concorrentes (reverse-api; risco de termos de uso) | Pequenos e-commerces |
| 13 | **Alertas de concursos e seleções** filtrados por cargo/região | Editais publicados | Concurseiros (B2C, ticket baixo) |
| 14 | **Modelos de documentos atualizados por assinatura** — contratos, políticas LGPD, termos de uso | Produção própria + revisão periódica | PMEs, freelancers |

### Arquitetura comum
coleta (API oficial ou reverse-api) → banco de dados (histórico, evitar duplicados)
→ IA (filtrar/resumir) → entrega (Telegram, e-mail, WhatsApp Business)
→ cobrança recorrente (Stripe, Asaas, Hotmart) → agendador + alerta de falha.

---

## Detalhe — Ideia 8: checagem de fornecedores

**Fluxo:** cliente envia lista de CNPJs (planilha) → robô consulta as fontes todo mês
(ou semana) → gera semáforo verde/amarelo/vermelho por fornecedor → relatório
+ **alerta quando algo muda** (o valor real está no alerta de mudança).

| Verificação | Fonte | Dificuldade |
|---|---|---|
| Situação cadastral, atividade (CNAE), sócios (QSA), data de abertura, capital | Dados abertos CNPJ (Receita) / BrasilAPI | Fácil, grátis |
| Sanções: CEIS, CNEP, CEPIM, acordos de leniência | API do Portal da Transparência (token grátis) | Fácil |
| Inidôneos TCU / improbidade CNJ | Consulta consolidada de PJ do TCU | Média |
| Lista suja do trabalho escravo | Cadastro de Empregadores (MTE), publicado periodicamente | Média (arquivo) |
| Sócio é PEP | Lista PEP do Portal da Transparência | Média (CPF mascarado) |
| CND federal, CNDT (TST), CRF/FGTS | Sites com captcha, sem API pública grátis | Difícil → agregador pago |
| Processos judiciais por CNPJ | DataJud não busca por parte → Escavador/Jusbrasil (pagos) | Difícil/pago |

**Sinais de alerta automáticos:** CNPJ inapto/baixado; empresa aberta há poucos meses
com contrato grande; capital social incompatível; sócio em comum com outro fornecedor
(conluio); endereço/telefone repetido entre fornecedores; entrada em lista de sanções.

**Quem compra:** empresas com programa de integridade (Lei 12.846/2013 e Decreto
11.129/2022 preveem diligência sobre terceiros), hospitais, construtoras, indústrias,
quem contrata muito terceirizado (responsabilidade subsidiária trabalhista).

**Preço:** por CNPJ monitorado em faixas (ex.: até 50, até 200, até 1.000), mais
parecer jurídico avulso quando dá vermelho.

**MVP:** só as fontes fáceis (cadastro + sanções + TCU) → já entrega valor; certidões e
processos entram depois via agregador pago, repassado no preço.
