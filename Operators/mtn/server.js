require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const createOperatorServer = require('../../shared/operatorServer');
createOperatorServer({ name: 'MTN Money', code: 'MTN', prefix: '05', table: 'mtn_clients', port: parseInt(process.env.MTN_PORT) || 5003 });
