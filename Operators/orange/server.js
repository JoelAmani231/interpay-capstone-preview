require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const createOperatorServer = require('../../shared/operatorServer');
createOperatorServer({ name: 'Orange Money', code: 'ORANGE', prefix: '07', table: 'orange_clients', port: parseInt(process.env.ORANGE_PORT) || 5002 });
