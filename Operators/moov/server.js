require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const createOperatorServer = require('../../shared/operatorServer');
createOperatorServer({ name: 'Moov Money', code: 'MOOV', prefix: '01', table: 'moov_clients', port: parseInt(process.env.MOOV_PORT) || 5001 });
