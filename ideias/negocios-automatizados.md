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

---

## Fora da caixa (sem relação com o mundo jurídico)

### Alertas de nicho (dados → aviso pago)
| # | Ideia | Fonte | Observação |
|---|---|---|---|
| 15 | **Previsão para hobbies** — ondas p/ surfistas, maré+lua p/ pescadores, vento p/ kitesurf, geada p/ produtor rural | Open-Meteo (grátis, inclui marine) | Assinatura barata no WhatsApp/Telegram; comunidades apaixonadas |
| 16 | **Alerta de reposição (restock)** — cartas Pokémon, LEGO, tênis, consoles | Lojas (reverse-api) | Comunidade paga no Discord/Telegram; risco de termos de uso |
| 17 | **Passagens baratas / erro de tarifa** saindo da sua cidade | APIs de agregadores de voo | Newsletter grátis + plano pago com alerta instantâneo |
| 18 | **Combustível mais barato** p/ motoristas de app e frotas | Levantamento semanal de preços da ANP | App/assinatura para frotas |

### Software pequeno com distribuição pronta
| # | Ideia | Observação |
|---|---|---|
| 19 | **App para lojas Nuvemshop/Shopify** (recuperação de carrinho via WhatsApp, avaliações, frete) | A loja de apps traz os clientes; cobrança mensal automática |
| 20 | **Plantão de sites** — monitora site fora do ar, SSL e domínio vencendo, para pequenas empresas | Técnico simples, suporte quase zero |
| 21 | **SEO programático** — site com milhares de páginas geradas de dados (ex.: "praias que aceitam cachorro", "pet shops 24h por bairro") | Receita de anúncios/afiliados; demora meses para ranquear |

### Conteúdo gerado por IA
| # | Ideia | Observação |
|---|---|---|
| 22 | **Histórias infantis personalizadas** (nome, cidade, pet da criança) — PDF semanal ou livro impresso sob demanda | Revisar conteúdo; pais pagam bem |
| 23 | **Cardápio semanal + lista de compras** ajustado a dieta/orçamento | Assinatura B2C; pode cruzar com preços de supermercado |
| 24 | **Atividades pedagógicas semanais** (colorir, caça-palavras, exercícios por série) para pais e professores | Kit mensal em PDF |

### Físico, mas com pouca mão de obra
| # | Ideia | Observação |
|---|---|---|
| 25 | **Mercadinho autônomo em condomínio** | Pagamento por app/PIX, estoque monitorado; exige reposição (terceirizável) |
| 26 | **Máquinas automáticas** (lavanderia self-service, vending, armários inteligentes) | Investimento inicial alto; receita recorrente |

### Vender dados/relatórios
| 27 | **Relatório mensal de preço de aluguel por bairro** para imobiliárias e investidores | Coleta de anúncios (reverse-api) + análise automática |

**Filtro para escolher:** (1) alguém já paga por isso hoje? (2) a fonte de dados é estável?
(3) o cliente acha você sozinho (loja de apps, SEO, comunidade) ou você precisa vender um a um?

---

## Combinações (modelo existente A + modelo existente B → dor resolvida)

### 28. Check-in diário para idosos por voz de IA ⭐
- **Combina:** teleassistência + agente de voz com IA + assinatura paga pelos filhos.
- **Dor:** idoso que mora sozinho; filhos longe e culpados; quedas que só são descobertas horas depois.
- **Como roda:** IA liga todo dia no horário combinado, conversa, lembra remédio, percebe sinais (confusão, tristeza, não atendeu) → avisa a família no WhatsApp. Relatório semanal para os filhos.
- **Escala:** custo marginal = minutos de ligação. Canal: grupos de filhos, geriatras, farmácias.
- **Teste em 7 dias:** landing page + 10 famílias com ligação feita por você mesmo (simula a IA) e mede retenção.

### 29. "Retrospectiva" mensal para pequenos negócios
- **Combina:** Spotify Wrapped + relatório financeiro + gerador de posts.
- **Dor:** dono de pequeno negócio não olha os números e não tem conteúdo para o Instagram.
- **Como roda:** conecta maquininha/iFood/Instagram → todo mês gera insights ("sua terça é 40% mais fraca") + posts prontos e compartilháveis ("1.200 cafés servidos em outubro").
- **Escala:** o post compartilhado é a propaganda (cada cliente divulga o produto).

### 30. Caçador de assinaturas esquecidas
- **Combina:** Rocket Money (EUA) + Open Finance Brasil (via agregadores como Pluggy/Belvo).
- **Dor:** brasileiro paga streaming, app e academia que nem usa; cobranças que sobem sem aviso.
- **Como roda:** lê a fatura, detecta recorrências, alerta reajuste, gera o pedido de cancelamento pronto.
- **Receita:** assinatura ou % da economia do primeiro ano.

### 31. "Síndico" da sua casa
- **Combina:** calendário de manutenção preventiva + marketplace de prestadores (tipo GetNinjas) + diagnóstico por foto com IA.
- **Dor:** casa só recebe atenção quando quebra (caixa d'água, filtro, ar-condicionado, dedetização, calha).
- **Como roda:** cadastro da casa → lembretes automáticos → 1 clique agenda prestador avaliado.
- **Receita:** assinatura + comissão do serviço.

### 32. Bolsa de permuta online entre empresas
- **Combina:** clubes de permuta (antigos, offline) + marketplace + moeda interna de créditos.
- **Dor:** pequena empresa com capacidade ociosa (horário vazio, estoque parado) e sem caixa.
- **Como roda:** dentista vende limpeza em créditos, usa créditos para pagar gráfica, que paga restaurante.
- **Receita:** mensalidade + taxa por transação. Efeito de rede = difícil de copiar. (Checar tributação de permuta.)

### 33. Preço dinâmico para mesas vazias de restaurante
- **Combina:** gestão de receita de companhia aérea + Too Good To Go.
- **Dor:** restaurante lotado sexta e vazio terça; desconto fixo destrói margem.
- **Como roda:** restaurante libera horários ociosos; app mostra "-30% hoje 19h"; desconto ajusta pela demanda.
- **Receita:** mensalidade do restaurante + comissão por mesa.

### 34. Desafio com dinheiro em jogo
- **Combina:** Strava/app de hábitos + contrato de compromisso (StickK/DietBet).
- **Dor:** promessa de academia/dieta/estudo que não dura 3 semanas.
- **Como roda:** pessoa deposita valor, comprova o hábito (foto, app, GPS); quem falha perde para o bolo dos que cumpriram.
- **Atenção:** pode ser enquadrado como aposta no Brasil → validar juridicamente; alternativa: valor perdido vai para ONG.
