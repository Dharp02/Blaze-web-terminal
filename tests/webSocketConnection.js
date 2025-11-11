const WebSocket = require('ws');

const ws = new WebSocket('wss://meteorwebterminal.opensource.mieweb.org:3002');

ws.on('open', () => {
    console.log('Connected successfully!');
    ws.close();
});

ws.on('error', (error) => {
    console.log('Connection failed:', error.message);
});