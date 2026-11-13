import 'dotenv/config';
import cron from 'node-cron';
import { connect } from '../src/connection.js';
import { runCycle } from './run-cycle.js';

const SCHEDULE = process.env.CRON_SCHEDULE ?? '0 */2 * * *';

const sock = await connect();
console.log(`Daemon ativo. Ciclo de publicação: "${SCHEDULE}" (cron).`);

cron.schedule(SCHEDULE, () => {
  runCycle(sock).catch((err) => console.error('Erro no ciclo de publicação:', err));
});

process.on('SIGTERM', () => sock.end(undefined));
process.on('SIGINT', () => sock.end(undefined));
