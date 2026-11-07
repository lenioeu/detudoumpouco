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

---

## Rodada 2 (recomeço) — critérios do usuário
Rodada 1 descartada: potencial de escala baixo e/ou concorrência alta.
Novos critérios: **escala alta**, **pouca concorrência**, **investimento quase zero**, qualquer cliente/formato.
Lógica usada: procurar mudanças recentes ("por que agora") que abriram mercados ainda vazios.

### R2-1. Cobrança recorrente para grupos de WhatsApp (Pix Automático)
- **Por que agora:** Pix Automático (2025) permite cobrança recorrente sem cartão.
- **O que é:** quem tem grupo/comunidade (corrida, receitas, bolão de estudos, mentoria, racha de futebol, escolinha) cobra mensalidade; quem paga entra, quem para de pagar sai do grupo automaticamente.
- **Escala:** milhões de grupos; receita = % de cada mensalidade; cada dono de grupo traz os membros.
- **Concorrência:** Hotmart/Kiwify focam em curso e cartão; nicho "WhatsApp + Pix recorrente" pouco ocupado.
- **Custo inicial:** baixo, usando provedor de pagamento que já oferece Pix Automático.

### R2-2. "Clone" de especialista por assinatura
- **O que é:** IA treinada com o conteúdo de um especialista (nutricionista, personal, professor, influenciador) que responde os seguidores 24h; seguidor paga mensalidade; receita dividida com o especialista.
- **Escala:** o especialista traz o público (custo de aquisição ~zero); replicável para centenas de especialistas.
- **Concorrência:** existe nos EUA (ex.: Delphi); no Brasil, quase vazio.
- **Teste:** 1 especialista parceiro, 30 dias.

### R2-3. Visibilidade de marcas nas respostas de IA (GEO)
- **Por que agora:** pessoas trocam o Google por ChatGPT/Gemini/Claude para pedir recomendação.
- **O que é:** monitora se a marca aparece quando alguém pergunta "melhor dentista em Curitiba" ou "melhor tênis de corrida barato"; relatório mensal + o que fazer para aparecer.
- **Escala:** SaaS puro; custo = chamadas de API.
- **Concorrência:** ferramentas globais em inglês; mercado local/PT-BR e pequenas empresas pouco atendido.

### R2-4. "Como é morar aqui" — avaliações de prédios e condomínios
- **O que é:** quem morou avalia o prédio (barulho, infiltração, internet, síndico, segurança) — o Reclame Aqui da moradia.
- **Escala:** conteúdo gerado pelos usuários + Google traz tráfego; efeito de rede.
- **Receita:** construtoras/administradoras/imobiliárias pagam para responder e ter perfil verificado; anúncios.
- **Concorrência:** nenhum player dominante no Brasil.
- **Risco:** moderação/difamação (Marco Civil, art. 19) — vantagem de quem é advogado.

### R2-5. IA que faz os orçamentos por você
- **O que é:** pessoa descreve o que precisa (pintar apartamento, conserto, frete); IA contata 10 prestadores por WhatsApp/ligação e devolve 3 orçamentos comparados.
- **Por que agora:** agentes de voz e WhatsApp com IA ficaram baratos.
- **Receita:** prestadores pagam por cliente fechado ou assinatura.

---

## Aprofundamento (preferências: gosta do R2-1; quer entender R2-2 e R2-5)

### R2-2 — Clone de especialista: detalhes
- **Montagem:** reunir conteúdo do especialista (vídeos transcritos, posts, e-books, lives, respostas de DM) →
  base de conhecimento consultada pela IA + instruções de tom, limites e quando mandar falar com o humano.
- **Produto para o seguidor:** não é só tirar dúvida; o que segura a assinatura é ser **proativo**
  (plano personalizado, check-in semanal, cobrança de meta, lembrete).
- **Dor do especialista:** DMs sem resposta, audiência grande que não vira dinheiro, não quer gravar mais conteúdo.
- **Economia (exemplo):** R$ 29–49/mês por seguidor; 50% especialista / 50% plataforma; custo de IA de poucos reais por usuário/mês.
- **Nichos para começar (menos regulados):** culinária, idiomas, concursos, marketing digital, carreira, artesanato, jardinagem.
- **Evitar no início:** saúde, nutrição, psicologia (conselhos profissionais, dados sensíveis/LGPD) e investimentos (regras da CVM).
- **Defesa:** contrato de exclusividade com o especialista + plataforma que fica melhor com o uso.
- **Sinergia com R2-1:** mesma infraestrutura (WhatsApp + Pix Automático). Produto único: "comunidade paga + clone do especialista dentro".
- **Teste:** 1 especialista, 30 dias, meta de 30–50 seguidores pagantes.

### R2-5 — IA que faz orçamentos: na prática
1. Cliente descreve no WhatsApp (texto, áudio, fotos). IA faz as perguntas que faltam (metragem, prazo, material).
2. IA monta pedido padronizado.
3. Busca 10–15 prestadores na região (Google Places API: nome, telefone, nota).
4. Envia o pedido por WhatsApp Business (mensagem modelo aprovada) ou ligação com agente de voz (avisando que é IA).
5. Prestadores respondem como quiserem; IA transcreve, pergunta o que faltou.
6. IA normaliza: preço, prazo, material incluso, garantia, nota no Google → tabela com os 3 melhores.
7. Cliente escolhe; IA agenda a visita.
- **Problema central:** o negócio fecha fora da plataforma → difícil cobrar comissão (desintermediação).
- **Saída mais forte (B2B):** síndicos e administradoras de condomínio precisam de **3 orçamentos** para quase toda obra/serviço
  → assinatura mensal para administradoras; cobrança garantida, demanda recorrente.
- **Teste manual:** fazer à mão para 10 pedidos em 1 categoria (pintura ou frete) na sua cidade; medir tempo e satisfação.

---

## R2-1 — Quem é o cliente (WhatsApp + Pix recorrente)

**Quem paga você:** o dono do grupo (fica com % de cada mensalidade). Os membros são clientes dele.
**Perfil ideal:** já cobra mensalidade, organiza tudo no WhatsApp, recebe Pix manualmente e sofre com inadimplência.

| Segmento | Exemplos | Dor | Observação |
|---|---|---|---|
| Esporte amador organizado ⭐ | assessorias de corrida, beach tennis, ciclismo, futevôlei, racha de futebol | cobrar todo mês, "fulano não pagou", constrangimento de cobrar amigo | Já cobram (R$ 100–300/mês nas assessorias), fáceis de achar (Instagram/Strava), indicam uns aos outros |
| Professores e mentores | grupos de concurso/OAB/ENEM, idiomas, música, mentorias | adicionar/remover aluno à mão, link do grupo vaza | Encaixa com o "clone" do especialista (R2-2) |
| Criadores de conteúdo | grupo VIP de receitas, maternidade, marketing, fitness | Hotmart/Kiwify não gerenciam o grupo; cartão é recusado | Ticket menor, volume maior |
| Aulas com mensalidade | escolinhas de futebol/natação/ballet, personal, pilates pequeno | inadimplência, cobrança manual | Concorre com Asaas e sistemas de academia |
| Associações | clubes de leitura, associações de moradores, ONGs, igrejas | contribuição recorrente informal | Volume grande, ticket baixo |
| **Evitar** | grupos de "sinais"/apostas/trading | risco de fraude, CVM, bets | Contamina a marca e o provedor de pagamento |

**Primeiro nicho sugerido:** assessorias de corrida.

**Validar antes de construir:**
1. WhatsApp: automação de entrar/sair do grupo pela API oficial é limitada; bibliotecas não oficiais arriscam banimento.
   Alternativas: link de convite individual após pagamento + lista de inadimplentes para o dono remover; ou Telegram (bot completo).
2. Dinheiro de terceiros: usar provedor com **split de pagamento** e Pix Automático (dinheiro cai direto para o dono),
   evitando que você vire instituição de pagamento regulada pelo Banco Central.
3. Entrevistar 10 donos de assessoria: quanto perdem com inadimplência e quanto tempo gastam cobrando.

---

## Rodada 3 — SaaS por assinatura que resolve um problema claro
Critério: nicho mal atendido no Brasil, dor concreta, cliente fácil de achar, custo inicial ~zero.

| # | SaaS | Problema | Quem paga | Por que agora / pouca concorrência |
|---|---|---|---|---|
| S1 ⭐ | **Gestão para instrutor de direção autônomo** — agenda, pacote de aulas, cobrança Pix, controle de horas exigidas, avaliação do aluno | Instrutor autônomo organiza tudo no WhatsApp e caderno | Instrutor (R$ 49–99/mês) | Novas regras da CNH permitem instrutor autônomo → mercado novo, sem ferramenta dominante (confirmar regras vigentes) |
| S2 ⭐ | **Riscos psicossociais da NR-1** — questionário anônimo, relatório, plano de ação e evidências para fiscalização | Pequena empresa não sabe cumprir a nova exigência e teme multa | Empresa (por funcionário/mês) ou consultorias de SST revendendo | Exigência fiscalizada a partir de 2026; mercado em formação |
| S3 | **Condomínio pequeno em autogestão** (6–30 unidades) — rateio, cobrança Pix Automático, prestação de contas, reservas | Síndico morador faz planilha; administradora é cara | Condomínio (R$ 2–5 por unidade/mês) | Grandes softwares miram administradoras; prédio pequeno é ignorado |
| S4 | **Brechó** — foto da peça vira anúncio pronto com IA + controle de consignação (repasse para quem deixou a peça) | Cadastrar peça é lento; acerto com consignantes é caótico | Brechó (R$ 49–149/mês) | Mercado de usados em alta; nada focado em consignação |
| S5 | **Obra pequena para empreiteiro** — orçamento por áudio/foto, cronograma, foto diária para o cliente, recebimento por etapa | Cliente desconfia, empreiteiro desorganizado, calote | Empreiteiro | Ferramentas existentes são para construtora, não para autônomo |
| S6 | **Assessoria esportiva** — treinos, presença, Strava, cobrança Pix recorrente | Cobrança e gestão manual no WhatsApp | Assessoria/treinador | Evolução da ideia R2-1 |

**Teste comum:** 10 conversas com o público-alvo + página com preço + lista de espera antes de programar.

### Concorrência — S6 assessoria esportiva (pesquisa 07/11/2026)
Mercado **já ocupado**: Treinus (líder, ~200+ assessorias, planos a partir de ~R$ 105/20 alunos), SisRUN Coach,
Fitney (app com a marca da assessoria), MFIT, Tecnofit (academias, com cobrança), TrainingPeaks (global),
além de treinadores de IA (Runna, comprado pelo Strava; Guerrinha IA no WhatsApp).
Brecha possível: treinador pequeno que não quer app e vive no WhatsApp + cobrança Pix Automático; esportes fora da corrida.
**Conclusão:** rebaixar S6; não atende o critério de pouca concorrência.

### Concorrência — S1 e S2 (pesquisa 07/11/2026)
- **S2 NR-1:** já há players (Indexmed com módulo COPSOQ II, QBest, softwares de SST como RSData) e tendência
  de os softwares de SST existentes adicionarem o módulo. MTE: questionário sozinho não basta — exige análise técnica
  integrada ao inventário de riscos/AEP. Mercado em formação, mas a janela está fechando.
- **S1 instrutor autônomo:** Resolução Senatran 1.020/2025; o governo lançou (maio/2026) a "Nova Jornada do Instrutor"
  no app CNH do Brasil — vitrine onde o aluno acha o instrutor e negocia pelo WhatsApp. **Não foi encontrada ferramenta
  de gestão para o instrutor** (agenda, pacotes, cobrança, controle de aulas, evolução do aluno). O governo gera a demanda;
  o SaaS cuida da gestão. Primeiras provas com instrutor particular no RJ em out/2026 → mercado começando agora.
  Riscos: app do governo ampliar funções; regras estaduais (Detran) variam; tamanho do mercado a confirmar.
- **Conclusão:** S1 é a brecha mais limpa encontrada até agora.

---

## Rodada 4 — SaaS que já funciona lá fora e falta no Brasil ("tropicalizar")
Lógica: modelo provado no exterior + versão brasileira (WhatsApp, Pix, marketplaces locais).

### T1 ⭐ Crosslisting para brechós e revendedores de usados
- **Lá fora:** EUA têm Vendoo (a partir de ~US$ 9/mês), List Perfectly (US$ 29–99+/mês), Crosslist — publicam a mesma peça em 10+ marketplaces e tiram dos outros quando vende.
- **Brasil:** integradores (Base.com, Anymarket, UpSeller) são para produto novo com estoque; não foi encontrado nenhum que inclua Enjoei e trate peça única.
- **Produto:** foto → IA escreve anúncio e sugere preço → publica em Enjoei, Mercado Livre, Shopee, OLX, Instagram → vendeu em um, some dos outros. Pode incluir consignação (ver S4).
- **Risco técnico:** Enjoei/OLX sem API pública → nos EUA isso é resolvido com extensão de navegador que age em nome do usuário (reverse-api ajuda a mapear).

### T2 Clienteling via WhatsApp para lojas físicas (modelo chinês WeCom/Weimob)
- **Lá fora:** na China, vendedores de loja atendem clientes pelo WeCom (WeChat corporativo); Weimob/Youzan vendem SaaS e IA para isso.
- **Brasil:** WhatsApp é o "WeChat brasileiro"; Suiteshare atende grandes redes (Reserva, Magalu); estimativa de ~50% dos vendedores ainda usam WhatsApp manual. Lojas médias/pequenas mal atendidas.
- **Dor:** vendedora usa WhatsApp pessoal → quando sai, leva os clientes; dono não vê nada; venda não atribuída.
- **Produto:** número da empresa por vendedor, carteira de clientes, lembretes (aniversário, "chegou seu tamanho"), IA sugere mensagem, comissão por venda atribuída.
- **Alvo:** lojas de roupa, calçados, ótica, joalheria, cosméticos, móveis.

### T3 Escala de turnos para bares, restaurantes e padarias (a verificar)
- **Lá fora:** Planday (Dinamarca), 7shifts (Canadá), Deputy, When I Work.
- **Brasil:** softwares focam em ponto eletrônico, não em montar escala, trocar turno, chamar folguista e comparar custo da escala com vendas.
- **Próximo passo:** pesquisar concorrência no Brasil.

**Fonte de mais ideias:** listas de micro-SaaS lucrativos (Indie Hackers, Acquire.com), mapas de vertical SaaS europeu (Point Nine), SaaS chinês de "tráfego privado".
