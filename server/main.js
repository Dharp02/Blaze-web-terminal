// simple-ssh-server.js - Simple SSH Terminal WebSocket Server
const WebSocket = require('ws');
const { Client } = require('ssh2');

class SimpleTerminalServer {
  constructor(port = 8080) {
    this.port = port;
    this.wss = null;
    this.sessions = new Map();
    this.clients = new Map();
  }

  start() {
    this.wss = new WebSocket.Server({ port: this.port });
    console.log(`🚀 Terminal server started on port ${this.port}`);

    this.wss.on('connection', (ws) => {
      const clientId = this.generateId();
      this.clients.set(clientId, ws);
      console.log(`📱 Client connected: ${clientId}`);

      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        clientId: clientId
      }));

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, clientId, message);
        } catch (error) {
          console.error('❌ Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        console.log(`📱 Client disconnected: ${clientId}`);
        this.cleanupClient(clientId);
      });

      ws.on('error', (error) => {
        console.error(`❌ WebSocket error for client ${clientId}:`, error);
      });
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down...');
      this.shutdown();
      process.exit(0);
    });
  }

  handleMessage(ws, clientId, message) {
    console.log(`📨 Message: ${message.type}`);

    switch (message.type) {
      case 'create_terminal':
        this.createTerminal(ws, clientId, message);
        break;
      case 'terminal_input':
        this.handleInput(message);
        break;
      case 'close_terminal':
        this.closeTerminal(message.sessionId);
        break;
      case 'resize_terminal':
        this.resizeTerminal(message);
        break;
    }
  }

  createTerminal(ws, clientId, message) {
    const { sessionId, cols = 80, rows = 24, sshConfig } = message;
    
    console.log(`🔧 Creating terminal: ${sessionId}`);
    console.log(`🔗 Connecting to: ${sshConfig.host}:${sshConfig.port} as ${sshConfig.username}`);

    const ssh = new Client();
    const session = {
      id: sessionId,
      clientId: clientId,
      ssh: ssh,
      stream: null,
      ws: ws,
      cols: cols,
      rows: rows,
      isConnected: false
    };

    this.sessions.set(sessionId, session);

    // SSH connection timeout
    const timeout = setTimeout(() => {
      if (!session.isConnected) {
        this.sendError(ws, sessionId, 'Connection timeout');
        this.cleanupSession(sessionId);
      }
    }, 15000);

    ssh.on('ready', () => {
      clearTimeout(timeout);
      console.log(`✅ SSH connected: ${sessionId}`);
      
      ssh.shell({
        cols: cols,
        rows: rows,
        term: 'xterm-256color'
      }, (err, stream) => {
        if (err) {
          console.error(`❌ Shell error: ${err.message}`);
          this.sendError(ws, sessionId, `Shell error: ${err.message}`);
          this.cleanupSession(sessionId);
          return;
        }

        session.stream = stream;
        session.isConnected = true;

        // Send success response
        ws.send(JSON.stringify({
          type: 'terminal_created',
          sessionId: sessionId,
          shell: 'bash',
          platform: 'linux',
          cols: cols,
          rows: rows,
          host: sshConfig.host
        }));

        // Handle terminal output
        stream.on('data', (data) => {
          ws.send(JSON.stringify({
            type: 'terminal_output',
            sessionId: sessionId,
            data: data.toString()
          }));
        });

        // Handle stream close
        stream.on('close', (code) => {
          console.log(`🔚 Stream closed: ${sessionId}`);
          ws.send(JSON.stringify({
            type: 'terminal_exit',
            sessionId: sessionId,
            exitCode: code || 0
          }));
          this.cleanupSession(sessionId);
        });

        // Handle stream errors
        stream.on('error', (err) => {
          console.error(`❌ Stream error: ${err.message}`);
          this.sendError(ws, sessionId, err.message);
        });
      });
    });

    ssh.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`❌ SSH error: ${err.message}`);
      
      let errorMessage = 'Connection failed';
      if (err.code === 'ENOTFOUND') {
        errorMessage = 'Host not found';
      } else if (err.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused - check host and port';
      } else if (err.message.includes('authentication')) {
        errorMessage = 'Authentication failed - check username and password';
      } else if (err.message.includes('timeout')) {
        errorMessage = 'Connection timeout';
      }
      
      this.sendError(ws, sessionId, errorMessage);
      this.cleanupSession(sessionId);
    });

    // Connect with provided credentials
    try {
      ssh.connect({
        host: sshConfig.host,
        port: sshConfig.port || 22,
        username: sshConfig.username,
        password: sshConfig.password,
        readyTimeout: 15000,
        keepaliveInterval: 30000
      });
    } catch (error) {
      console.error(`❌ Connect error: ${error.message}`);
      this.sendError(ws, sessionId, error.message);
      this.cleanupSession(sessionId);
    }
  }

  handleInput(message) {
    const { sessionId, input } = message;
    const session = this.sessions.get(sessionId);

    if (session && session.stream && session.isConnected) {
      try {
        session.stream.write(input);
      } catch (error) {
        console.error(`❌ Input error: ${error.message}`);
      }
    }
  }

  resizeTerminal(message) {
    const { sessionId, cols, rows } = message;
    const session = this.sessions.get(sessionId);

    if (session && session.stream) {
      try {
        session.stream.setWindow(rows, cols);
        session.cols = cols;
        session.rows = rows;
        console.log(`📐 Resized ${sessionId} to ${cols}x${rows}`);
      } catch (error) {
        console.error(`❌ Resize error: ${error.message}`);
      }
    }
  }

  closeTerminal(sessionId) {
    console.log(`🗑️ Closing terminal: ${sessionId}`);
    this.cleanupSession(sessionId);
  }

  cleanupSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      if (session.stream) {
        session.stream.end();
      }
      if (session.ssh) {
        session.ssh.end();
      }
      
      session.ws.send(JSON.stringify({
        type: 'terminal_closed',
        sessionId: sessionId
      }));
    } catch (error) {
      console.error(`❌ Cleanup error: ${error.message}`);
    }

    this.sessions.delete(sessionId);
  }

  cleanupClient(clientId) {
    // Close all sessions for this client
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.clientId === clientId) {
        this.cleanupSession(sessionId);
      }
    }
    this.clients.delete(clientId);
  }

  sendError(ws, sessionId, error) {
    ws.send(JSON.stringify({
      type: 'terminal_error',
      sessionId: sessionId,
      error: error
    }));
  }

  shutdown() {
    console.log('🛑 Cleaning up...');
    
    for (const sessionId of this.sessions.keys()) {
      this.cleanupSession(sessionId);
    }

    if (this.wss) {
      this.wss.close();
    }
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
}

// Start server
const server = new SimpleTerminalServer(8080);
server.start();