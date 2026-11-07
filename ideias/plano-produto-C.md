# Plano — Produto C: "Fechou, assinou, recebeu"

Proposta/contrato → aceite pelo WhatsApp → sinal Pix → parcelas com lembrete → (se calote) título executivo.
Versão 1 do plano — 07/11/2026.

## 1. Posicionamento (achado importante da pesquisa)
- **Assinar pelo WhatsApp sozinho não diferencia**: Clicksign (aceite via WhatsApp, foco em grandes empresas)
  e ZapSign (WhatsApp como crédito extra pago) já fazem.
- **Diferencial = o pacote completo para o pequeno**: proposta + aceite + cobrança + parcelamento + lembrete +
  prova jurídica para executar o calote. Ninguém encontrado junta tudo para autônomo/pequena empresa.
- Frase: **"Não é um assinador. É fechar o serviço e garantir que você recebe."**
- O assinador pelo WhatsApp (plano antigo do fundador) vira o **motor** do produto e também uma **API vendida separadamente**.

## 2. Fluxo do produto
1. Autônomo cria a proposta (modelo pronto por profissão; IA ajuda a escrever escopo e sugerir preço).
2. Define pagamento: sinal + N parcelas (Pix com vencimento) ou recorrência (Pix Automático).
3. Envia pelo WhatsApp. Cliente abre, lê, confirma identidade (código enviado no WhatsApp + CPF) e aceita.
4. Sistema gera PDF final com **trilha de auditoria** (data/hora, IP, número verificado, hash do documento) e manda para os dois.
5. Cliente paga o sinal no mesmo fluxo (QR Pix / copia e cola).
6. Parcelas: lembrete antes do vencimento, no dia e após atraso; baixa automática quando paga.
7. Atrasou além de X dias: botão "gerar notificação extrajudicial" e "dossiê para execução" (contrato + trilha + extrato).

## 3. Base jurídica (vantagem do fundador — validar texto oficial)
- MP 2.200-2/2001, art. 10, §2º: assinaturas fora da ICP-Brasil válidas se aceitas pelas partes.
- Lei 14.063/2020: assinatura eletrônica simples / avançada / qualificada.
- **CPC art. 784, §4º (Lei 14.620/2023)**: título eletrônico com qualquer assinatura eletrônica prevista em lei,
  **dispensa testemunhas** quando a integridade é conferida por provedor de assinatura → contrato aceito pode virar
  **título executivo extrajudicial** (execução direta, sem ação de cobrança). Argumento de venda central.
- Mirar **assinatura avançada**: vínculo único ao signatário (código no WhatsApp + CPF), detecção de alteração (hash).
- LGPD: política de privacidade, termos, base legal, retenção, DPO/encarregado.
- Código de Defesa do Consumidor nos contratos-modelo (cliente final muitas vezes é consumidor).

## 4. Pagamentos
- Usar provedor com **subcontas e split** (ex.: Asaas, Efí, Pagar.me — comparar): cada autônomo tem subconta,
  o provedor faz o KYC, o dinheiro cai direto para ele e a plataforma recebe sua parte. Evita virar instituição de pagamento.
- Pix com vencimento (cobrança por parcela) + Pix Automático (recorrente) + webhook de pagamento para baixa automática.
- Boleto/cartão como opção futura.

## 5. WhatsApp
- **API oficial (WhatsApp Cloud API da Meta)** — obrigatório num produto de prova jurídica; não oficial = risco de banimento.
- Mensagens de modelo aprovadas (utilidade): envio de documento, código de verificação, lembretes de pagamento.
- Custo por conversa → repassar no preço. Exige verificação do negócio na Meta (CNPJ).

## 6. Arquitetura (proposta)
- Cloudflare Workers (API) + D1 (banco) + R2 (PDFs) + Cron/Queues (lembretes) — tudo já conectado nesta sessão.
- Painel web simples para o autônomo + página pública de aceite (mobile).
- Geração de PDF com hash SHA-256 e carimbo de tempo; trilha de auditoria imutável.
- API pública desde o início (assinatura + cobrança) para vender a outros sistemas.

## 7. Fases
| Fase | Entrega | Duração estimada |
|---|---|---|
| 0. Validação | concorrência a fundo, 10–15 entrevistas com autônomos, página com lista de espera, preço | 1–2 semanas |
| 1. Motor de aceite | documento → WhatsApp → código → aceite → PDF com trilha + API | 2–3 semanas |
| 2. Cobrança | sinal Pix, parcelas, lembretes, baixa automática (provedor com split) | 2–3 semanas |
| 3. Proposta com IA | modelos por profissão, IA para escopo e preço | 1–2 semanas |
| 4. Pós-calote | notificação extrajudicial, dossiê para execução | 1–2 semanas |
| 5. Escala | API para parceiros, indicação ("feito com X"), planos pagos | contínuo |

## 8. Receita (hipótese)
- Grátis: poucos documentos/mês (porta de entrada).
- Plano mensal (faixa R$ 29–79) com documentos e lembretes ilimitados.
- Pequena taxa sobre o valor recebido pela plataforma (via split).
- API: preço por documento aceito.
- Extra: notificação/dossiê de cobrança; parceria com advogados para execução.

## 9. Riscos
- Concorrentes de assinatura podem adicionar cobrança (velocidade e foco no pequeno são a defesa).
- Dependência de Meta (WhatsApp) e do provedor de pagamento.
- Contestação judicial da assinatura → caprichar na trilha de auditoria.
- Custo de mensagens do WhatsApp em escala.

## 10. Decisões do fundador
1. Nome e domínio.
2. CNPJ e verificação na Meta.
3. Provedor de pagamento (posso comparar taxas e APIs).
4. Primeiro público para o teste (ex.: prestadores de obra/reforma, fotógrafos, designers).
5. Começar pela Fase 0 (recomendado) ou já pelo motor de aceite.
