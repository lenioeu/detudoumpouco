# AssinaBot

Bot de WhatsApp para colher assinaturas eletrônicas em documentos do escritório. Quem assina faz tudo **dentro do WhatsApp**: não há site, cadastro nem aplicativo extra.

## Como funciona

**Para o escritório**

1. Manda o PDF para o número do bot.
2. A IA (Claude) lê o documento e diz quem deve assinar e em que ordem. O escritório confirma ou corrige por texto ("o outorgado é João Pereira").
3. O bot pede o contato de cada pessoa: cartão da agenda, número digitado ou "Eu mesmo assino".
4. Depois de uma confirmação final, o bot convida quem vai assinar.
5. O escritório é avisado a cada assinatura e, no fim, recebe a via final.

**Para quem assina**

1. Recebe: "*Olá, Maria! Escritório X enviou o documento "Procuração" para você assinar…*", com o botão **Ver documento**.
2. Toca no botão e recebe o PDF na conversa, com os botões **Assinar** e **Recusar**.
3. Ao tocar em **Assinar**, digita o CPF para confirmar a identidade.
4. Quando todos assinam, recebe a via final ali mesmo.

Na ordem **sequencial**, cada pessoa só é convidada depois que a anterior assina. Na **simultânea**, todas são convidadas de uma vez.

## A via final

O PDF final tem:

- **O documento original**, sem alteração.
- **A página de assinaturas**, com um bloco por pessoa, preenchido com "*Assinado eletronicamente por Maria da Silva, CPF \*\*\*.982.247-\*\*, WhatsApp +55 (51) 98888-7777, em 15/10/2026 às 11:11:30*".
- **O manifesto de assinaturas**, com o código do documento, os SHA-256 do original e da versão assinada e, para cada pessoa, a data e hora do convite, do recebimento do documento e da confirmação, além do ID da mensagem de WhatsApp.
- **A assinatura digital do arquivo**, feita com o certificado do escritório. Qualquer alteração posterior aparece como assinatura inválida no Adobe Reader ou no verificador do ITI.

O bot também guarda no banco (tabela `eventos`) cada passo: convites, botões tocados, entrega e leitura das mensagens.

## Testar sem WhatsApp (simulador)

**Versão on-line, sem instalar nada:** o mesmo simulador roda inteiro no navegador como página do claude.ai. A leitura do documento usa o Claude da conta de quem abre a página, e a via final pode ser salva pelo botão "Salvar PDF". Para gerar a página a partir do código: `npm run simulador:web` (cria `dist/simulador-web.html`).

**Versão local:**

O simulador roda o bot de verdade, mas no lugar do WhatsApp abre uma página no navegador com três celulares lado a lado: o **escritório** (você), **Maria da Silva** e **João Pereira**. Não precisa de conta na Meta nem de servidor.

1. Instale o [Node.js](https://nodejs.org) (versão 22 ou mais nova, botão "LTS").
2. Baixe este repositório (botão verde **Code → Download ZIP** no GitHub) e descompacte.
3. Abra o terminal na pasta descompactada e rode:

   ```bash
   npm install
   npm run simulador
   ```

4. Abra **http://localhost:3000** no navegador.

Como usar:

- No celular do escritório, toque em **📎 PDF** e escolha um documento.
- Para informar o contato de alguém, use o botão **👤** (compartilha o contato de um dos outros celulares) ou digite o número.
- Nos celulares de Maria e João aparecem os convites. Toque nos botões como a pessoa faria. Para o CPF, use números válidos de teste, como `529.982.247-25` e `111.444.777-35`.
- Os PDFs (inclusive a via final assinada) abrem ao clicar no arquivo na conversa.

**Sem a chave da Anthropic**, o simulador funciona em *modo demonstração*: a IA não lê o PDF. Toque em **Corrigir** e escreva as partes, por exemplo `outorgante: Maria da Silva; outorgado: João Pereira`. **Para testar a leitura de verdade**, rode com a chave:

```bash
ANTHROPIC_API_KEY=sua-chave npm run simulador
```

(No Windows, no PowerShell: `$env:ANTHROPIC_API_KEY="sua-chave"; npm run simulador`.)

Nada sai do seu computador, exceto o PDF enviado à Anthropic quando a chave é usada. Ao fechar o simulador, as conversas são apagadas.

## O que você precisa

| Item | Para quê | Custo |
|---|---|---|
| Um servidor pequeno (VPS de 1 GB) com HTTPS | Rodar o bot | A partir de ~R$ 25/mês |
| Conta Meta Business verificada e um número **exclusivo** para o bot | API oficial do WhatsApp | Meta cobra por mensagem de template (centavos) |
| Chave da API da Anthropic | Ler o documento e identificar as partes | Centavos por documento |
| Certificado A1 ICP-Brasil do escritório (opcional) | Dar mais peso à assinatura digital da via final | O que o escritório já tem |

## Instalação

### 1. WhatsApp (Meta for Developers)

1. Crie um app do tipo **Business** em developers.facebook.com, adicione o produto **WhatsApp** e registre o número do bot.
2. Gere um **token permanente** (usuário do sistema no Business Manager) → `WHATSAPP_TOKEN`.
3. Copie o **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`, e o **App secret** (Configurações do app → Básico) → `WHATSAPP_APP_SECRET`.
4. Em **WhatsApp → Configuração → Webhook**, informe `https://SEU-BOT/webhook/whatsapp` e o mesmo `WHATSAPP_VERIFY_TOKEN` do `.env`. Assine o campo `messages`.
5. Crie e aprove os dois **templates** abaixo, na categoria **Utilidade** e no idioma **Português (BR)**.

**`solicitacao_assinatura`** (convite a quem vai assinar):

> Olá, {{1}}! {{2}} enviou o documento "{{3}}" para você assinar eletronicamente. Toque no botão abaixo para ver o documento.
>
> Botão: **Resposta rápida**, texto "Ver documento"

**`aviso_assinatura`** (aviso para quem não fala com o bot há mais de 24h):

> Atualização sobre o documento "{{1}}": {{2}}. Responda esta mensagem para receber os detalhes.

A Meta só deixa o número da empresa iniciar uma conversa por template aprovado. Se o escritório ou quem assinou estiver fora da janela de 24 horas, o bot manda esse aviso e entrega a mensagem completa (e a via final) quando a pessoa responder.

### 2. O bot

Requer Node.js 22.5 ou mais novo.

```bash
cp .env.example .env   # preencha
npm install
npm start
```

Na primeira execução, se não houver certificado em `CERTIFICATE_PATH`, o bot gera um **autoassinado**. Ele já impede alterações silenciosas, mas não identifica o escritório perante terceiros. Para isso, aponte `CERTIFICATE_PATH` para o arquivo `.pfx`/`.p12` do certificado A1 do escritório e informe a senha em `CERTIFICATE_PASSWORD`.

Rotas:

- `GET /saude`: verificação de funcionamento
- `GET|POST /webhook/whatsapp`: Meta (confere a assinatura `X-Hub-Signature-256`)

Desenvolvimento: `npm run dev` (recarrega ao salvar), `npm test` e `npm run typecheck`.

## Segurança

- Só os números em `AUTHORIZED_SENDERS` podem enviar documentos. Os botões de assinatura só valem no WhatsApp da pessoa convidada.
- O PDF em análise fica no SQLite só até o envio ou o cancelamento. Os documentos enviados e as vias finais ficam no banco (`DATABASE_PATH`), então faça backup dele e proteja o servidor.
- O documento é enviado à API da Anthropic para identificar as partes. Avalie isso no contexto do sigilo profissional e da LGPD, e informe os clientes na política de privacidade do escritório.
- O `npm audit` aponta um alerta no `node-forge` (GHSA-86w9-cpqp-85rv). Ele afeta a *verificação* de assinaturas RSA, que o bot não faz: ele só assina.

## Validade jurídica

É **assinatura eletrônica** (MP 2.200-2/2001, art. 10, § 2º; CPC, art. 411), não assinatura qualificada ICP-Brasil de cada signatário. Serve para procurações, contratos de honorários, declarações e contratos em geral. Não substitui o certificado ICP-Brasil para peticionar nos sistemas dos tribunais.

A identificação de quem assina se apoia em três elementos: o documento chega ao WhatsApp da própria pessoa, ela toca em "Assinar" e confirma com o CPF, e tudo fica registrado com data, hora e ID da mensagem.

## Limitações conhecidas

- Só aceita PDF. Documentos do Word precisam ser convertidos antes.
- O CPF é conferido só pelos dígitos verificadores. O bot não consulta a Receita Federal nem compara com o CPF do documento.
- Não há painel na internet. O acompanhamento é pelas mensagens do bot e pelo banco SQLite.
