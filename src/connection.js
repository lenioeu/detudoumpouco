import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from 'baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';

const AUTH_DIR = new URL('../auth', import.meta.url).pathname;

const logger = pino({ level: 'silent' });

export async function connect({ phoneNumber } = {}) {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    if (!phoneNumber) {
      throw new Error(
        'Conta ainda não vinculada. Rode novamente passando o número com DDI, ex:\n' +
        '  npm run connect -- 5511999999999'
      );
    }
    const code = await sock.requestPairingCode(phoneNumber);
    console.log(`\nCódigo de pareamento: ${code}`);
    console.log('No celular: WhatsApp > Configurações > Dispositivos conectados > Conectar dispositivo > Vincular com número de telefone, e digite o código acima.\n');
  }

  await new Promise((resolve, reject) => {
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'open') {
        console.log('Conectado ao WhatsApp.');
        resolve();
      } else if (connection === 'close') {
        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode
          : undefined;
        if (statusCode === DisconnectReason.loggedOut) {
          reject(new Error('Sessão desconectada (logout). Apague a pasta auth/ e vincule novamente.'));
        }
      }
    });
  });

  return sock;
}
