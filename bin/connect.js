import { connect } from '../src/connection.js';

const phoneNumber = process.argv[2];

const sock = await connect({ phoneNumber });
console.log('Vínculo salvo em auth/. Pode encerrar com Ctrl+C.');
setTimeout(() => sock.end(undefined), 2000);
