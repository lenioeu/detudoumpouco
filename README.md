# AssinaBot

Bot de WhatsApp para colher assinaturas eletrônicas em documentos do escritório.

1. O advogado manda o PDF para o número do bot.
2. A IA (Claude) lê o documento e diz quem deve assinar e em que ordem. O advogado confirma ou corrige por texto.
3. O bot pede o contato de cada pessoa (cartão da agenda ou número digitado).
4. Depois de uma confirmação final, o documento vai para o [Documenso](https://github.com/documenso/documenso), e cada pessoa recebe pelo WhatsApp um botão **Ler e assinar**.
5. O bot avisa o advogado a cada assinatura e, no fim, devolve o PDF assinado com o certificado de assinaturas.

## Como funciona

```
 WhatsApp do advogado ─┐                          ┌─ WhatsApp de quem assina
                       ▼                          │   (template com botão)
               ┌──────────────┐  PDF + partes     │
  Meta Cloud ─►│   AssinaBot  │──────────────► Claude
  API webhook  │  (este repo) │                   │
               └──────┬───────┘                   │
                      │ API v1 + webhooks         │
                      ▼                           ▼
               ┌──────────────┐   página de assinatura (navegador)
               │  Documenso   │◄───────────────────────────────
               │ (seu servidor)│   assinatura PAdES + certificado
               └──────────────┘
```

- **Página de assinaturas:** o bot acrescenta ao fim do PDF uma página com um bloco por signatário (nome, papel, WhatsApp, linha de assinatura e data). Também imprime o SHA-256 do documento original. Assim funciona com qualquer PDF, sem precisar achar as linhas de assinatura no texto.
- **Ordem sequencial:** quando um assina, o próximo recebe o link. Na ordem simultânea, todos recebem de uma vez.
- **Provas:** o Documenso gera o certificado com IP, data, hora e hash de cada assinatura. O bot guarda no SQLite (tabela `eventos`) quando cada link foi enviado, entregue e lido no WhatsApp.

## O que você precisa

| Item | Para quê | Custo |
|---|---|---|
| Servidor com Docker (VPS de ~2 GB de RAM) e dois domínios com HTTPS | Rodar o Documenso e o bot | VPS a partir de ~R$ 30/mês |
| Conta Meta Business verificada e um número **exclusivo** para o bot | API oficial do WhatsApp | Meta cobra por mensagem de template (centavos) |
| Chave da API da Anthropic | Ler o documento e identificar as partes | Centavos por documento |

## Instalação

### 1. Documenso

Siga o guia oficial de instalação via Docker (`docker/production/compose.yml` no repositório do Documenso). Pontos importantes:

- **Certificado de assinatura:** o Documenso assina o PDF final com um certificado `.p12`, configurado em `NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH` e `NEXT_PRIVATE_SIGNING_PASSPHRASE`. Um certificado autoassinado funciona. Um certificado ICP-Brasil do escritório (A1) dá mais peso ao documento final.
- **Se o bot e o Documenso rodarem na mesma máquina ou rede**, o Documenso bloqueia webhooks para endereços internos. Libere o host do bot com `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=nome-do-host-do-bot`.

Depois de instalado, no painel do Documenso:

1. **Configurações → API Tokens**: crie um token e coloque em `DOCUMENSO_API_TOKEN`.
2. **Configurações → Webhooks**: cadastre `https://SEU-BOT/webhook/documenso`, com os eventos `DOCUMENT_RECIPIENT_COMPLETED`, `DOCUMENT_COMPLETED` e `DOCUMENT_REJECTED`. Defina um segredo e coloque em `DOCUMENSO_WEBHOOK_SECRET`.

### 2. WhatsApp (Meta for Developers)

1. Crie um app do tipo **Business** em developers.facebook.com, adicione o produto **WhatsApp** e registre o número do bot.
2. Gere um **token permanente** (usuário do sistema no Business Manager) → `WHATSAPP_TOKEN`.
3. Copie o **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`, e o **App secret** (Configurações do app → Básico) → `WHATSAPP_APP_SECRET`.
4. Em **WhatsApp → Configuração → Webhook**, informe `https://SEU-BOT/webhook/whatsapp` e o mesmo `WHATSAPP_VERIFY_TOKEN` do `.env`. Assine o campo `messages`.
5. Crie e aprove os dois **templates** abaixo, na categoria **Utilidade** e no idioma **Português (BR)**.

**`solicitacao_assinatura`** (pedido de assinatura enviado a quem vai assinar):

> Olá, {{1}}! {{2}} enviou o documento "{{3}}" para você assinar eletronicamente. Toque no botão abaixo para ler e assinar.
>
> Botão: **Visitar site**, texto "Ler e assinar", URL **dinâmica** `https://SEU-DOCUMENSO/sign/{{1}}`

**`aviso_assinatura`** (aviso ao escritório quando passou mais de 24h desde a última mensagem dele):

> Atualização sobre o documento "{{1}}": {{2}}. Responda esta mensagem para receber os detalhes.

A Meta só deixa o número da empresa iniciar uma conversa por template aprovado. Dentro de 24h desde a última mensagem da pessoa, mensagens livres funcionam.

### 3. O bot

Requer Node.js 22.5 ou mais novo.

```bash
cp .env.example .env   # preencha
npm install
npm start
```

Rotas:

- `GET /saude`: verificação de funcionamento
- `GET|POST /webhook/whatsapp`: Meta (confere a assinatura `X-Hub-Signature-256`)
- `POST /webhook/documenso`: Documenso (confere o `X-Documenso-Secret`)

Desenvolvimento: `npm run dev` (recarrega ao salvar), `npm test` e `npm run typecheck`.

## Segurança

- Só os números em `AUTHORIZED_SENDERS` podem enviar documentos. Outros números recebem uma resposta padrão.
- O PDF em análise fica no SQLite só até o envio ou o cancelamento. O documento enviado fica guardado no Documenso.
- O documento é enviado à API da Anthropic para identificar as partes. Avalie isso no contexto do sigilo profissional e da LGPD, e informe os clientes na política de privacidade do escritório.

## Validade jurídica

É **assinatura eletrônica** (MP 2.200-2/2001, art. 10, § 2º; CPC, art. 411), não assinatura qualificada ICP-Brasil. Serve para procurações, contratos de honorários, declarações e contratos em geral. Não substitui o certificado ICP-Brasil para peticionar nos sistemas dos tribunais.

A identificação de quem assina se apoia no envio do link ao WhatsApp da pessoa. Por isso o bot registra entrega e leitura de cada mensagem.

## Limitações conhecidas

- Só aceita PDF. Documentos do Word precisam ser convertidos antes.
- O Documenso exige um e-mail por signatário. Quando o contato não tem e-mail, o bot usa `<telefone>@whatsapp.invalid` (configurável), e esse endereço aparece no certificado de assinaturas.
- Quem assina não recebe automaticamente a cópia final pelo WhatsApp: isso exigiria um terceiro template, com o documento anexado.
- A confirmação de identidade por código (2FA) do Documenso faz parte da edição paga, e não é usada aqui.
