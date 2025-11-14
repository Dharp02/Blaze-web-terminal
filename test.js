const WebSocket = require('ws');

const ws = new WebSocket('ws://10.15.189.46:8080');

ws.on('open', () => {
    console.log('Connected successfully!');
    ws.close();
});

ws.on('error', (error) => {
    console.log('Connection failed:', error.message);
});