import { connect } from '../src/connection.js';

const sock = await connect();
const groups = await sock.groupFetchAllParticipating();

console.log('Grupos em que a conta está:');
for (const group of Object.values(groups)) {
  console.log(`${group.id}  —  ${group.subject}`);
}

setTimeout(() => sock.end(undefined), 1000);
