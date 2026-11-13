import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions';
import { createInterface } from 'node:readline/promises';
import { readFile, writeFile } from 'fs/promises';

const SESSION_PATH = new URL('../telegram-session.txt', import.meta.url).pathname;

async function loadSession() {
  try {
    return await readFile(SESSION_PATH, 'utf8');
  } catch {
    return '';
  }
}

// Conecta no Telegram. Na primeira vez, pede telefone/código no terminal e
// salva a sessão em telegram-session.txt (não commitado); depois disso,
// conecta direto sem pedir nada.
export async function connectTelegram({ apiId, apiHash }) {
  const session = await loadSession();
  const client = new TelegramClient(new StringSession(session), Number(apiId), apiHash, {
    connectionRetries: 5
  });

  if (!session) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await client.start({
      phoneNumber: () => rl.question('Número de telefone (com DDI, ex: 5511999999999): '),
      password: () => rl.question('Senha de verificação em duas etapas (se tiver, senão Enter): '),
      phoneCode: () => rl.question('Código recebido no Telegram: '),
      onError: (err) => console.error('Erro no login do Telegram:', err)
    });
    rl.close();
    await writeFile(SESSION_PATH, client.session.save());
    console.log('Sessão do Telegram salva em telegram-session.txt.');
  } else {
    await client.connect();
  }

  return client;
}
