require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const createOperatorServer = require('../../shared/operatorServer');
// Wave accepte 01, 05, 07 — prefix multi-valeur géré dans operatorServer
createOperatorServer({ name: 'Wave', code: 'WAVE', prefix: '01|05|07', table: 'wave_clients', port: parseInt(process.env.WAVE_PORT) || 5004 });
