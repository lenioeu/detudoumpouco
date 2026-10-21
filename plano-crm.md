# Plano de Desenvolvimento — CRM de Atendimento via WhatsApp

> Documento de trabalho. Base escolhida: **Whaticket (linha SaaS)**.
> Conexão inicial: **WhatsApp via QR code (Baileys)** para desenvolvimento.
> Objetivo: reconstruir, com código próprio e marca própria, um CRM de atendimento
> no WhatsApp, partindo de uma base open source — não copiar o produto pago.

---

## 1. Visão geral da stack

O Whaticket é full-stack em JavaScript/TypeScript:

| Camada | Tecnologia | Para que serve |
|---|---|---|
| Backend | Node.js + TypeScript + Express + Sequelize | Regras do sistema, API |
| Banco de dados | **MySQL / MariaDB** (padrão MariaDB 10.6) | Guarda tickets, contatos, mensagens |
| Conexão WhatsApp | **whatsapp-web.js** ou **zapo** (por QR) | Enviar/receber mensagens |
| Node.js | 14+ (provider wwebjs) ou 22+ (provider zapo) | Runtime do backend |
| Frontend | React | Painel do atendente e dashboard |
| Tempo real | Socket.IO | Conversas aparecendo ao vivo |
| Empacotamento | Docker | Sobe tudo junto com um comando |

Você **não precisa dominar tudo isso** — vamos mexendo peça por peça conforme o backlog.

---

## 2. Roadmap em fases

### Fase 0 — Subir e rebatizar
- [ ] Instalar Docker (em andamento)
- [ ] Instalar Git e VS Code
- [ ] Escolher o fork vivo (conferir data do último commit juntos)
- [ ] Clonar o projeto e configurar o arquivo `.env`
- [ ] Subir com Docker e conectar um número de teste por QR
- [ ] Trocar nome, logo e cores para a sua marca

### Fase 1 — Arrumar as dores (vira melhor que o CRM atual)
Baseado nas 10 dores encontradas na análise:
- [ ] Centralizar horário de atendimento + mensagem de ausência num só lugar
- [ ] Cadastro de feriados
- [ ] **Expiração por inatividade** (fecha ticket parado → conserta TMA/SLA)
- [ ] Resolver saudação duplicada (bot vs. conexão vs. setor)
- [ ] Limpeza/deduplicação da base de contatos

### Fase 2 — Diferenciais (onde entra a IA)
- [ ] **Funil como entidade própria** (etapa por lead, histórico, conversão) — ver seção 4
- [ ] Editor de fluxo do bot com **rascunho + publicação + teste** — ver seção 5
- [ ] Bot que coleta nome e resumo do caso
- [ ] IA: resposta sugerida + resumo do atendimento
- [ ] Follow-up em cadência automática ("não respondeu em 2 dias → manda Y")

---

## 3. Recurso → já vem no Whaticket? → prioridade

| Recurso | Base Whaticket | Prioridade |
|---|---|---|
| Conexão WhatsApp (QR) + texto/mídia/áudio | ✅ já vem | Essencial |
| Ticket com status + histórico por contato | ✅ já vem | Essencial |
| Setores/filas + vínculos usuário/conexão | ✅ já vem | Essencial |
| Bot com menu em árvore | ✅ versão simples | Essencial |
| Transferir / aceitar / finalizar + log | ✅ já vem | Essencial |
| Contatos CRUD + tags + import/export | ✅ já vem | Essencial |
| Respostas rápidas com `/` | ✅ já vem | Essencial |
| Perfis Admin/Atendente | ✅ básico | Essencial |
| Horário de atendimento + ausência centralizados | ⚠️ parcial | Essencial |
| Expiração automática (bot e atendimento) | 🔨 construir | Essencial |
| Editor de fluxo com rascunho/publicação + teste | 🔨 construir | Importante |
| Bot com captura de dados / palavra-chave / condição | 🔨 construir | Importante |
| Distribuição automática (rodízio / carga / limite) | ⚠️ parcial | Importante |
| Funil/etapas próprias + qualificação Ganho/Perda | 🔨 construir | Importante |
| Kanban de tickets | ✅ já vem | Importante |
| Agendamento de mensagens (recorrência + variáveis) | ✅ já vem | Importante |
| Dashboard tempo real + TMA/espera/abandono | ⚠️ parcial | Importante |
| Campos personalizados de contato | ✅ já vem | Importante |
| Webhooks + API REST com chaves | ✅ já vem | Importante |
| Pesquisa de satisfação (1–5) | ✅ já vem | Importante |
| API oficial Meta + templates + custos | 🔨 construir | Importante |
| IA: resposta sugerida + resumo | 🔨 construir | Extra (alto valor) |
| Follow-up automático em cadência | 🔨 construir | Extra (alto valor) |
| Tarefas/projetos ligados ao ticket | ✅ já vem (alguns forks) | Extra |
| Chat interno entre atendentes | ✅ já vem (alguns forks) | Extra |
| Instagram / Facebook / Telegram | ⚠️ varia | Extra |
| Segurança (2FA, lista de IPs, auditoria) | 🔨 construir | Extra |

Legenda: ✅ pronto · ⚠️ existe parcial, precisa ajustar · 🔨 construir do zero

---

## 4. Modelo de dados — o Funil (novo)

Hoje, no CRM analisado, "etapas" são só tags soltas. O seu diferencial é ter um
**Funil de verdade**. Esboço das entidades novas:

```
Funil (id, nome, ativo)
 └─ EtapaFunil (id, funil_id, nome, ordem, cor)

LeadEtapa (contato_id, etapa_id, entrou_em)   // em que etapa o lead está AGORA
HistoricoEtapa (contato_id, de_etapa, para_etapa, mudou_em, usuario_id)  // trilha

// Qualificação Ganho/Perda ligada ao ticket (já esboçada na análise):
Qualificacao (ticket_id, motivo, tipo[ganho|perda], valor_rs, nota, obs)
```

Com isso saem relatórios que o sistema atual não tem: **conversão por etapa**,
**tempo médio em cada etapa** e **valor em R$ por etapa do funil**.

---

## 5. Spec do editor de fluxo (bot) — rascunho vs. publicado

Dor nº 4 da análise: hoje o bot grava toda alteração na hora, sem rascunho nem teste,
e isso quebra o bot em produção. A correção:

- **Dois estados por fluxo:** `rascunho` (editável) e `publicado` (o que roda de verdade).
- Editar mexe só no rascunho. Um botão **"Publicar"** copia o rascunho para o publicado.
- **Versões:** guardar cada publicação para poder voltar atrás.
- **Simulador:** uma janela de teste que roda o rascunho sem falar com clientes reais.
- **Nós do fluxo (além dos atuais):**
  - Enviar mensagem (texto/mídia)
  - Menu de opções (árvore — já existe)
  - Atribuir a setor / atendente (já existe)
  - **Capturar dado** (pergunta nome, CPF, e-mail e valida)
  - **Condição** (se resposta = X, vai pro nó Y)
  - **Desvio por horário** (dentro/fora do expediente)
  - Chamar IA (sugerir resposta / resumir)
  - Finalizar (já existe)

---

## 6. O que fazer SEM depender do Docker

- [ ] Instalar **Git** (https://git-scm.com) e **VS Code** (https://code.visualstudio.com)
- [ ] Definir a **marca**: nome do sistema, cores, logo
- [ ] Escolher o **fork** (conferir último commit, issues abertas, docker-compose)
- [ ] Decidir o **número de WhatsApp de teste** (use um chip/número descartável no começo)
- [ ] Revisar e priorizar este backlog conforme a sua realidade de escritório

---

## 7. Avisos importantes

- **Risco de ban:** QR code = WhatsApp não oficial. Ótimo para testar, arriscado para
  envio em massa. Use número descartável no início; para produção/campanha, migrar para
  a API oficial da Meta.
- **LGPD:** ao importar a base real de contatos, você passa a ser responsável por dados
  pessoais. Tenha base legal, finalidade clara e um jeito de a pessoa pedir remoção.
- **Legalidade da reconstrução:** partir de uma base open source e customizar é legítimo.
  Copiar código, telas ou marca do produto pago, não. Mantenha o seu por cima da base aberta.
```
