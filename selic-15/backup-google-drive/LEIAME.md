# Backup diário do SELIC-15 no Google Drive

Todo dia, por volta das 6h, um script da conta Google do CREFITO-15 busca os dados do SELIC-15 e salva numa pasta do Drive:

- **`SELIC-15 backup AAAA-MM-DD`** (planilha Google): uma aba para cada parte do sistema, para consulta. As abas são Processos, Contratos, Tarefas, Designações, Parcerias, Agenda, Metas, Equipe, Histórico, Usuários e Sobre.
- **`SELIC-15 backup AAAA-MM-DD.json`**: todos os dados brutos. **É este arquivo que permite restaurar o sistema.**

Backups com mais de 90 dias vão para a lixeira do Drive automaticamente. Esse prazo fica em `MANTER_DIAS`, no código.

## 1. Cloudflare: criar a credencial do backup

1. Em **one.dash.cloudflare.com**, vá em **Access → Service Auth → Service Tokens → Create Service Token**.
2. Nome: `SELIC-15 backup`. Duração: a mais longa disponível, para não vencer sem aviso.
3. Copie o **Client ID** e o **Client Secret**. O segredo só aparece uma vez; guarde até o passo 3.
4. Vá em **Access → Applications → SELIC-15 → Policies → Add a policy**:
   - Action: **Service Auth**
   - Include: **Service Token** → `SELIC-15 backup`
5. Salve. Essa credencial só consegue baixar o backup; o SELIC-15 recusa qualquer outra ação feita com ela.

## 2. Google Drive: criar a pasta

1. Na conta Google do CREFITO-15, crie a pasta **SELIC-15 – Backups**.
2. Abra a pasta e copie o código do fim do endereço: em `https://drive.google.com/drive/folders/1AbC...xyz`, o código é `1AbC...xyz`.

## 3. Google Apps Script: instalar o backup

1. Com a mesma conta Google, abra **script.google.com → Novo projeto** e dê o nome `SELIC-15 Backup`.
2. Apague o conteúdo do editor e cole todo o arquivo `Codigo.gs` desta pasta.
3. Na linha `const PASTA_ID = '...'`, troque o texto pelo código da pasta copiado no passo 2.
4. Clique na engrenagem (**Configurações do projeto**):
   - em **Fuso horário**, escolha `(GMT-03:00) Horário de Brasília`;
   - em **Propriedades do script**, adicione as duas abaixo.

   | Propriedade | Valor |
   |---|---|
   | `CF_CLIENT_ID` | o Client ID do passo 1 |
   | `CF_CLIENT_SECRET` | o Client Secret do passo 1 |

5. Volte ao editor, escolha a função **`instalar`** e clique em **Executar**. O Google pede autorização para:
   - acessar o Drive;
   - criar planilhas;
   - conectar a serviços externos.

   Autorize.
6. Pronto. O primeiro backup aparece na pasta na hora, e os próximos saem todo dia por volta das 6h.

## Se algo falhar

- O Google manda um e-mail para a conta dona do script quando uma execução falha.
- As execuções aparecem em **script.google.com → SELIC-15 Backup → Execuções**.
- Mensagem "O SELIC-15 não entregou o backup": confira se a política **Service Auth** está na aplicação SELIC-15 e se o Client ID e o Secret estão corretos em Propriedades do script.
- Quando renovar a credencial no Cloudflare, atualize as duas propriedades do script.
