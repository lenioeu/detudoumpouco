# Canal de achados no WhatsApp

Bot simples usando [Baileys](https://github.com/WhiskeySockets/Baileys) para publicar
achados de engenharia reversa / pesquisa automaticamente em um Canal do WhatsApp.

## Como funciona

A Baileys reimplementa o protocolo do WhatsApp Web (projeto open-source, não é API
oficial da Meta). Isso significa:

- A conta usada precisa ser uma conta de WhatsApp real (recomenda-se um número
  dedicado só para o bot, não o seu número pessoal).
- Usar automação por fora do app oficial viola os Termos de Serviço do WhatsApp;
  o número pode ser banido. Use com moderação (nada de envio em massa) e por
  sua conta e risco.

## Passo 1 — Vincular a conta

```bash
npm run connect -- 5511999999999
```

(troque pelo número com DDI, sem `+` e sem espaços). Vai aparecer um **código de
pareamento** no terminal — digite-o no celular em
*WhatsApp > Configurações > Dispositivos conectados > Conectar dispositivo >
Vincular com número de telefone*.

As credenciais da sessão ficam salvas em `auth/` (não commitado — é informação
sensível, equivale a estar logado na conta).

## Passo 2 — Criar o canal

```bash
npm run setup-channel -- "Achados de RE" "Descrição opcional"
```

Cria o canal e salva o JID em `channel.json`.

## Passo 3 — Publicar um achado

```bash
npm run post -- "Texto do achado a publicar"
```

Pode ser chamado repetidamente (de um script, de um hook, etc.) para publicar
achados conforme forem gerados.
