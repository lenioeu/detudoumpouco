# Plano — SaaS para instrutor de direção autônomo (+ versão para autoescolas/CFCs)

Continuação de `ideias/instrutor-autonomo-briefing.md`. Pesquisa de mercado feita em 07/11/2026
via busca na web; citações ao lado de cada afirmação relevante. Onde a fonte é um blog/portal
de nicho (não o Detran ou o Ministério dos Transportes direto), isso está marcado — vale
confirmar antes de usar o número em qualquer decisão de investimento.

## 1. Tamanho de mercado e regras por estado

### 1.1 Por que o mercado está nascendo agora
- **Resolução CONTRAN nº 1.020/2025** (1º/dez/2025, não é da Senatran — a Senatran só opera o
  sistema): permite aula prática em CFC **ou** com instrutor de trânsito autônomo, sem vínculo
  obrigatório com autoescola. Reduziu a carga mínima obrigatória de aula prática para 2h/aula na
  primeira habilitação. ([Detran-RJ via Diário do Rio](https://diariodorio.com/detran-rj-autoriza-instrutor-autonomo-de-transito-no-estado/))
- **Lei nº 12.302/2010** continua sendo a base dos requisitos do instrutor: 21+ anos, ensino
  médio completo, CNH há 2+ anos, sem infrações graves recentes. ([Jornal de Brasília](https://jornaldebrasilia.com.br/noticias/brasil/governo-lanca-nova-jornada-do-instrutor-no-app-cnh-do-brasil/))
- Credenciamento é **estadual**: o instrutor se cadastra no Portal de Serviços da Senatran
  (login Gov.br), a Senatran analisa e o **Detran do estado** publica a portaria de autorização.
  Validade do credenciamento varia por estado (ver tabela 1.3).
- **App "CNH do Brasil"** ganhou em abr/mai de 2026 a função **"Nova Jornada do Instrutor"**:
  busca por localização/CEP, perfil com foto e currículo, avaliação por estrelas, selo na CNH
  digital; contato e negociação seguem fora do app, por WhatsApp. ([Autopapo](https://autopapo.com.br/noticia/funcao-cnh-do-brasil-instrutores-localizacao/),
  [Canaltech](https://canaltech.com.br/carros/tirar-cnh-no-brasil-acaba-de-ficar-ainda-mais-facil-com-app-veja-o-motivo/))
  **Confirma a tese do briefing: o app é só vitrine de descoberta — não tem agenda, cobrança,
  controle de horas nem ficha de evolução do aluno.**
- Instrutores já cadastrados nos sistemas estaduais tiveram até **06/07/2026** para migrar o
  cadastro para a plataforma nacional — ou seja, a base de usuários endereçável já existia antes
  do app federal e está passando por uma migração agora.

### 1.2 Tamanho de mercado (estimativas — não existe número oficial consolidado)
| Métrica | Valor encontrado | Fonte / confiabilidade |
|---|---|---|
| CFCs em operação no Brasil | ~15.757 | IstoÉDinheiro — data de referência incerta, possivelmente pré-reforma |
| CNHs emitidas/ano | ~3 milhões (estimativa) | Seu Crédito Digital (estimativa de terceiro) |
| CNHs emitidas jan–mai/2026 | 1.141.765 (+8,9% vs 2025) | Balanço oficial do programa CNH do Brasil — **este é o dado mais confiável** |
| Gasto total anual dos candidatos com CNH | ~R$ 9,6 bi | Citado em matéria de imprensa, sem metodologia clara |
| Faturamento do setor de autoescolas | sem número oficial atual; Feneauto estima perda de R$ 14 bi/ano com a desobrigação | **Feneauto é parte interessada** (defende a obrigatoriedade) — tratar como limite superior, não como fato |
| Instrutores autônomos credenciados (nacional) | **não encontrado** | — |
| Instrutores autônomos credenciados (PR) | 12.421 "autorizados" | Citado em liminar judicial, não confirmado como número oficial do Detran-PR |
| Preço da aula com instrutor autônomo | R$ 70–155/hora | Blogs de comparação de preço — sem tabela oficial, preço é livre |
| Preço da aula em autoescola | R$ 20–60/hora | idem |
| Custo total das 2h obrigatórias com instrutor autônomo | R$ 150–250 | idem |

**Leitura:** o único dado robusto é o volume de CNHs emitidas (governo). Todo o resto — número
de instrutores, faturamento do setor, impacto da reforma — vem de estimativas de partes
interessadas (Feneauto do lado das autoescolas) ou de blogs. Para um TAM defensável, falta um
dado primário: **quantos instrutores autônomos estão credenciados, por estado**. Isso é público
mas disperso em painéis separados de cada Detran — nenhuma matéria agregou. Ação recomendada:
puxar a lista pública de credenciados em 3–4 Detrans grandes (GO, PR, RJ, SC — são os que têm
processo mais maduro) antes de fechar o plano de negócio.

### 1.3 Regras por estado — o padrão e onde variam
Todos os estados seguem a Resolução CONTRAN 1.020/2025, mas cada Detran publica portaria própria
com requisitos, prazos e nível de fiscalização diferentes. Nenhuma portaria de SP apareceu nas
buscas — é a lacuna mais importante para preencher (maior mercado do país).

| Estado | Validade do credenciamento | Pontos específicos | Fonte |
|---|---|---|---|
| **RJ** | — | Eliminou aula prática obrigatória em autoescola; 2h/aula mínimas | [Diário do Rio](https://diariodorio.com/detran-rj-autoriza-instrutor-autonomo-de-transito-no-estado/) |
| **MG** | — | Portaria Detran nº 129/2026; pedido pelo Sistema de Credenciamento de Empresas (SCE); taxa R$ 138,96; instrutor **não precisa ter carro próprio** (pode usar o carro do aluno) | [Agência Minas](https://www.agenciaminas.mg.gov.br/noticia/detran-mg-adequa-sistemas-para-que-autoescolas-possam-atuar-conforme-nova-legislacao-nacional-129186) |
| **GO** | 2 anos | Exige cópia da CNH, certificado de ensino médio, certificado do curso de instrutor, comprovante de endereço, Certidão de Auditoria (Anexo I) | [Goiás.gov](https://goias.gov.br/detran/passo-a-passo-para-o-credenciamento-de-instrutor-autonomo/) |
| **PA** | 12 meses | Cadastro aberto por edital | [DOL](https://dol.com.br/carajas/noticias/para/933376/) |
| **AC** | 12 meses | Portaria nº 49/2026 | — |
| **SC** | anual (alvará) | Portaria Normativa nº 5/2026 — parecer da Assembleia Legislativa apontou lacunas de segurança/fiscalização na norma federal | [ALESC](https://portalelegis.alesc.sc.gov.br/) |
| **CE** | — | Instrutores reclamam que o sistema do Detran-CE direciona automaticamente para veículo de autoescola, driblando a norma | [O Povo+](https://mais.opovo.com.br/jornal/cidades/2026/03/13/instrutores-autonomos-acusam-detran-ce-de-barrar-uso-de-veiculos-proprios-nos-exames.html) |
| **PR** | — | ~12.421 "autorizados" (não confirmado); ASCEFOCON-PR obteve liminar parcial exigindo certidão de regularidade do Detran-PR antes do cadastro na plataforma nacional | [Liminar ASCEFOCON-PR](https://www.portaldotransito.com.br/wp-content/uploads/2026/05/Liminar-ASCEFOCON-PR.pdf) |
| **PI** | — | Edital explicita que o instrutor atua "por sua conta e risco" | — |
| **SP** | **não encontrado** | Nenhuma portaria específica apareceu na busca — maior mercado do país e maior lacuna de dados | — |

**Implicação de produto:** não dá para hard-code uma única regra de "carga horária" ou "validade
de credencial" — o produto precisa de um campo de configuração por estado (ou pelo menos avisos
diferentes), e isso é também um motivo para o instrutor preferir uma ferramenta própria a
confiar só no app federal, que trata o país como regra única.

### 1.4 Litígio e risco regulatório (relevante para due diligence, não só para o instrutor)
- **SP (SindiautoescolaSP):** liminar negada pela Justiça Federal; decisão provisória, mérito
  ainda não julgado — a resolução **continua valendo em todo o país** por ora.
- **PR (ASCEFOCON-PR):** liminar parcial — obriga exigir certidão de regularidade do Detran-PR
  para cadastro, mas **não suspende** a resolução nem o programa CNH do Brasil.
- **CE:** instrutores buscam ação no Ministério Público / Justiça Federal contra o
  direcionamento para veículo de autoescola.
- **STF:** há menção de ação no STF contra a mudança, sem detalhes de andamento confirmados.
- **MG:** matéria (status atual não confirmado) de que o governo estadual avaliaria "coibir" o
  credenciamento — sinal de resistência político-administrativa mesmo em estado grande.
- Entidades do setor (Feneauto e sindicatos estaduais) estão organizando "contra-ataque" no
  Congresso e no STF.

**Risco central para a tese:** a política pode ser revertida, judicializada ou fortemente
restringida em um ou mais estados antes do produto atingir escala — e o produto precisaria se
adaptar estado a estado de qualquer forma (seção 1.3). **Mitigação estrutural:** não apostar o
negócio inteiro no instrutor autônomo. A trilha B2B para CFC (seção 4) é resiliente a esse risco:
autoescola vai sempre precisar de gestão, com ou sem a resolução.

---

## 2. Roteiro de entrevista

Objetivo das duas rodadas: validar dor, fluxo de trabalho atual e disposição a pagar **antes**
de programar qualquer linha de MVP. Meta: 5–10 instrutores autônomos + 3–5 donos/gestores de
CFC, em pelo menos 2 estados com estágios de regulação diferentes (ex.: GO/PR, que já têm
processo maduro, e um estado mais atrasado).

### 2.1 Instrutores autônomos (B2C)

**Perfil e contexto**
1. Há quanto tempo você é instrutor? Já trabalhou em autoescola antes de ser autônomo?
2. Quantos alunos ativos você tem hoje, em média, por mês?
3. Em que estado e cidade você atua? Já concluiu o credenciamento como autônomo — quanto tempo levou o processo?

**Operação hoje (o fluxo real, não o ideal)**
4. Como você organiza sua agenda hoje? (papel, WhatsApp, Google Agenda, planilha, nenhum sistema)
5. Como você cobra o aluno? Pix manual, dinheiro, cartão, outro? Você já perdeu aula por não cobrar antecipado?
6. Como você registra as horas de aula para cumprir a exigência do Detran? Isso já te gerou algum problema (prova recusada, aula não contabilizada)?
7. Você mantém algum registro da evolução do aluno (o que já praticou, pontos fracos)? Como?
8. Como o aluno te encontra hoje? (indicação, app CNH do Brasil, Instagram, grupo de WhatsApp)

**Dor e prioridade**
9. Qual a parte mais chata ou que mais te toma tempo no dia a dia administrativo (não dirigindo)?
10. Você já perdeu dinheiro por falta/cancelamento de aluno sem aviso? Com que frequência?
11. Se pudesse resolver só UMA coisa com um app, qual seria?

**Tecnologia e disposição a pagar**
12. Você usa algum app de gestão hoje (mesmo genérico, tipo agenda ou cobrança)? Qual, e o que acha dele?
13. Hoje você pagaria uma mensalidade fixa por um app que resolvesse [a dor citada em #11]? Quanto pagaria por mês?
14. Prefere pagar mensalidade fixa ou uma taxa só quando recebe (ex.: 3–5% sobre cada Pix recebido)? Por quê?
15. Você conhece algum outro instrutor que já testou algum app parecido? Qual foi a experiência?

**Encerramento**
16. Posso te chamar de novo quando tivermos um protótipo, para você testar?

### 2.2 Donos/gestores de autoescola/CFC (B2B)

**Perfil**
1. Quantos alunos ativos e quantos instrutores/veículos a autoescola tem hoje?
2. Como a rotina mudou desde a Resolução 1.020/2025 — perdeu alunos para instrutor autônomo, ganhou alunos pelo app CNH do Brasil, ou não sentiu diferença?

**Operação hoje**
3. Como vocês controlam hoje matrícula, pacote de aulas e pagamento — sistema, planilha, papel?
4. Como é feito o controle das horas de aula exigidas por aluno (compliance com o Detran)? Já tiveram problema em auditoria ou fiscalização por registro incorreto?
5. Vocês usam algum sistema de gestão de CFC hoje (Inove CFC, Transitare, e-conductor, outro)? O que funciona e o que falta nele?
6. Como é o processo de cobrança dos alunos — boleto, Pix, cartão, carnê em papel?

**Dor e prioridade**
7. Qual processo administrativo consome mais tempo do time hoje?
8. O que, na prática, causaria mais problema numa fiscalização do Detran hoje?

**Tecnologia e disposição a pagar**
9. Quanto vocês pagam hoje (se pagam) por sistema de gestão? Por aluno, por instrutor, ou fixo?
10. O que faria vocês trocarem de sistema hoje?
11. Teria interesse em um sistema que também gerenciasse instrutores autônomos parceiros da escola (modelo híbrido)?

---

## 3. MVP e modelo de receita — instrutor autônomo (B2C)

### 3.1 Escopo do MVP
Baseado na hipótese do briefing, mas reduzido ao essencial testável sem grande engenharia:

| Feature | Prioridade | Observação |
|---|---|---|
| Agenda de aulas (criar, remarcar, bloquear horário) | P0 | Precisa de view simples, mobile-first |
| Pacotes de aula (ex.: pacote de 10h) e controle de saldo | P0 | É o que sustenta a cobrança recorrente |
| Cobrança via Pix (cobrança simples, idealmente Pix automático/recorrente) | P0 | Maior dor citada no briefing; validar com entrevistas se recorrência é aceita pelo aluno |
| Lembrete de aula por WhatsApp (automático) | P0 | Reduz no-show, baixo custo de implementação (API WhatsApp Business) |
| Controle das horas exigidas por aluno (compliance Detran) | P1 | Regra varia por estado (seção 1.3) — modelar como configuração, não hard-code |
| Ficha de evolução do aluno | P1 | Pode começar como campo de texto livre, sem estrutura pedagógica complexa |
| Perfil público / página de agendamento (como alternativa ao WhatsApp manual) | P2 | Só depois de validar que instrutor quer ser encontrado fora do app CNH do Brasil |

**MVP 0 (antes de programar):** validar com um "concierge MVP" — planilha + bot de WhatsApp
manual rodando para 3–5 instrutores reais por 2–4 semanas, medindo adoção e disposição a pagar
real (não hipotética) antes de qualquer linha de código de produto.

### 3.2 Modelo de receita
Duas hipóteses do briefing, com recomendação:

- **Mensalidade fixa (R$ 49–99/mês):** previsível, mas o instrutor autônomo tem renda variável e
  resiste a custo fixo em mês ruim — risco de churn alto nos primeiros meses de cada instrutor.
- **Taxa sobre pagamento recebido (modelo Fresha, ~3–5%):** alinha custo à renda do instrutor
  (só paga quando recebe), reduz fricção de adoção, mas depende de o instrutor processar o
  pagamento pela plataforma (não simplesmente usar a agenda e cobrar por fora via Pix manual).

**Recomendação:** modelo híbrido — **grátis para agenda e lembrete** (gancho de adoção, baixo
custo marginal) **+ taxa sobre cobrança processada pela plataforma** (monetiza quem de fato usa
o Pix integrado). Evita a objeção de mensalidade fixa identificada no próprio briefing e cobra
de quem recebe mais valor. Testar as duas âncoras de preço nas entrevistas (pergunta 14 do
roteiro) antes de travar.

### 3.3 Distribuição inicial
- Comunidades e grupos de WhatsApp/Telegram de instrutores autônomos por estado (provavelmente
  já existem, formados após a abertura dos cadastros estaduais).
- Parceria ou ao menos presença onde o instrutor já está logado: ele cadastra o selo no app CNH
  do Brasil — isso é um ponto de contato de aquisição (ex.: conteúdo/anúncio direcionado a quem
  pesquisa "como ser instrutor autônomo").
- Associações/listas de credenciados publicadas pelos Detrans (GO, PR, SC já têm) — fonte de
  outbound direto.

---

## 4. Versão para autoescolas/CFCs (B2B)

### 4.1 Por que faz sentido no mesmo produto
- O usuário pediu explicitamente essa frente, e ela **reduz o risco regulatório** da aposta
  pura em instrutor autônomo (seção 1.4): CFC é obrigado a existir e vai precisar de gestão
  independente do desfecho da resolução.
- **Muitas CFCs ainda operam no papel** — confirmado pela pesquisa: o software mais citado no
  mercado brasileiro de gestão de autoescola é fragmentado e pouco maduro. Os únicos nomes que
  apareceram foram **Inove CFC** (foco em dar ao proprietário controle de caixa) e
  **Transitare**, da Tecnodata Educacional (pré-lançamento, sem dados de adoção), além de
  **e-conductor** (empresa de 2016, sem avaliações públicas). Nenhum preço público foi
  encontrado para nenhum dos três — sinal de mercado pouco transparente e pouco competitivo em
  marketing digital, não necessariamily de baixa demanda.
- Isso é uma faixa branca real: não há um "Notion das autoescolas" nem um player dominante
  visível — diferente de verticais SaaS mais maduras.

### 4.2 Escopo do produto B2B
| Módulo | Equivalente no B2C | Observação específica de CFC |
|---|---|---|
| Matrícula e CRM de alunos | — | Funil de matrícula, pacote contratado, status do processo (teórico/prático/exame) |
| Agenda de aulas e veículos | Agenda de aulas | Agenda por instrutor **e** por veículo (CFC tem frota, instrutor autônomo normalmente não) |
| Cobrança (Pix, boleto, carnê) | Cobrança Pix | CFC tende a ter contratos maiores e inadimplência mais relevante — cobrança recorrente/boleto importa mais que no B2C |
| Controle de horas por aluno (compliance Detran) | Controle de horas | Aqui o risco é maior: fiscalização e auditoria podem autuar a CFC, não só o instrutor — este módulo é o principal gancho de venda |
| Gestão de instrutores (próprios e parceiros autônomos) | — | Módulo novo: CFC pode querer formalizar parceria com instrutores autônomos no modelo híbrido pós-resolução |
| Relatórios para fiscalização/Detran | — | Exportação no formato que o Detran pede — alto valor percebido, baixo custo de construir uma vez validado o formato |

### 4.3 Diferenciação frente aos concorrentes existentes
- Posicionar como mais simples e mais barato que os sistemas legados de CFC (que parecem
  vendidos via contato comercial direto, sem transparência de preço — fricção que um produto
  self-service com preço público já resolveria).
- Usar a adjacência com o módulo B2C: uma CFC que opera no modelo híbrido (instrutores próprios
  + parceiros autônomos) só consegue gerenciar os dois num sistema que fala a língua dos dois —
  diferencial natural de ter nascido do lado do instrutor autônomo.

### 4.4 Modelo de receita B2B
- **Mensalidade por CFC**, provavelmente escalada por nº de alunos ativos ou de instrutores/veículos (modelo SaaS clássico B2B), não por transação — CFC tem fluxo de caixa mais estável que instrutor individual e espera previsibilidade de custo.
- Validar faixa de preço nas entrevistas (pergunta 9 do roteiro 2.2); como não há preço público
  dos concorrentes, a janela de descoberta de preço é mais aberta (bom e ruim: oportunidade, mas
  sem âncora de mercado).

### 4.5 Go-to-market B2B
- Cuidado: sindicatos/associações de CFC (Feneauto e similares) estão politicamente mobilizados
  **contra** a resolução que criou o instrutor autônomo — abordá-los como canal de venda pode
  gerar atrito se o produto também atender instrutores autônomos. Melhor ir direto a CFCs
  individuais (outbound, eventos do setor como "CFC do Futuro" citado pelo Portal do Trânsito)
  do que via entidade de classe, ao menos nesta fase.

---

## 5. Como as duas pontas convivem no mesmo SaaS
- Modelo de dados único: "prestador de aula" pode ser um instrutor autônomo (pessoa física) ou
  uma CFC (organização com múltiplos instrutores e veículos) — o mesmo módulo de agenda, horas e
  cobrança serve aos dois, variando só em cardinalidade (1 instrutor x N instrutores/veículos).
- CFC pode ter instrutores autônomos "satélite" vinculados como parceiros — ponto de venda
  cruzada natural (CFC usando o produto também recruta instrutores autônomos para usá-lo).
- Faturamento pode ser diferente por segmento (taxa sobre Pix no B2C, mensalidade fixa no B2B)
  sem precisar de dois produtos.

## 6. Riscos consolidados e próximos passos imediatos
**Riscos principais:** (1) regulatório/judicial — a resolução pode ser restringida; (2) dado de
mercado fraco — TAM real desconhecido até confirmar número de credenciados por estado; (3)
heterogeneidade estadual — produto precisa de configuração por estado desde o início; (4) app
federal pode evoluir para oferecer gestão basica, embora hoje não ofereça.

**Próximos passos imediatos:**
1. Ligar/pesquisar diretamente nos portais de GO, PR, RJ e SC para obter o número público de
   instrutores credenciados (preenche a lacuna do item 1.2).
2. Rodar as entrevistas dos roteiros 2.1 e 2.2 — mínimo 5 instrutores + 3 CFCs, em pelo menos
   2 estados.
3. Rodar o "MVP 0" (planilha + WhatsApp manual) com 3–5 instrutores reais por 2–4 semanas antes
   de programar.
4. Montar página de lista de espera separada para instrutor autônomo e para CFC, para medir
   intenção de cada segmento de forma independente.
