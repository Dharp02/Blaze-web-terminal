const WebSocket = require('ws');
const { Client } = require('ssh2');

class SimpleTerminalServer {
  constructor(port = 8080) {
    this.port = port;
    this.wss = null;
    this.sessions = new Map();
    this.clients = new Map();
    
    this.sessionScreens = new Map();
    // Session cleanup settings
    this.sessionTimeoutMs = 30 * 60 * 1000; // 30 minutes before cleanup
    this.cleanupInterval = 5 * 60 * 1000; // Check every 5 minutes
    
    // Start periodic cleanup
    this.startSessionCleanup();
  }

  start() {
    this.wss = new WebSocket.Server({ port: this.port });
    console.log('Terminal server started on port', this.port);

    this.wss.on('connection', (ws) => {
      const clientId = this.generateId();
      this.clients.set(clientId, ws);
      console.log('Client connected:', clientId);

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
          console.error('Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected:', clientId);
        // DON'T cleanup sessions immediately - just mark them as disconnected
        this.markClientSessionsAsDisconnected(clientId);
        this.clients.delete(clientId);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error for client', clientId + ':', error);
      });
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      this.shutdown();
      process.exit(0);
    });
  }

  /*
   * Mark sessions as disconnected but keep SSH alive
   */
  markClientSessionsAsDisconnected(clientId) {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.clientId === clientId) {
        console.log('Marking session', sessionId, 'as disconnected (keeping SSH alive)');
        session.ws = null;
        session.clientId = null;
        session.disconnectedAt = new Date();
        // Keep isConnected as true since SSH is still active
      }
    }
  }

  /**
   * Periodic cleanup of old disconnected sessions
   */
  startSessionCleanup() {
    setInterval(() => {
      const now = new Date();
      let cleanedCount = 0;
      
      for (const [sessionId, session] of this.sessions.entries()) {
        // Only cleanup sessions that have been disconnected for too long
        if (!session.ws && session.disconnectedAt) {
          const timeSinceDisconnect = now - session.disconnectedAt;
          if (timeSinceDisconnect > this.sessionTimeoutMs) {
            console.log('Cleaning up old session:', sessionId);
            this.cleanupSession(sessionId, false);
            cleanedCount++;
          }
        }
      }
      
      if (cleanedCount > 0) {
        console.log('Cleaned up', cleanedCount, 'old sessions');
      }
    }, this.cleanupInterval);
  }

  handleMessage(ws, clientId, message) {
    console.log('Message:', message.type);

    switch (message.type) {
      case 'create_terminal':
        this.createTerminal(ws, clientId, message);
        break;
      case 'reconnect_session':
        this.reconnectSession(ws, clientId, message.sessionId);
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

  reconnectSession(ws, clientId, sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.isConnected || !session.ssh) {
      console.log('Session not found or disconnected:', sessionId);
      ws.send(JSON.stringify({
        type: 'session_not_found',
        sessionId: sessionId
      }));
      return;
    }

    console.log('Reconnecting to session:', sessionId);
    
    // Update WebSocket reference for this session
    session.ws = ws;
    session.clientId = clientId;
    session.disconnectedAt = null; // Clear disconnect time
    
    // Send reconnection success
    ws.send(JSON.stringify({
      type: 'session_reconnected',
      sessionId: sessionId,
      title: session.name || 'Terminal ' + sessionId.substr(0, 8),
      host: session.host,
      username: session.username,
      cols: session.cols,
      rows: session.rows
    }));
    //   Request current screen content from SSH
    if (session.stream && session.isConnected) {
      console.log('Requesting current screen content for session:', sessionId);
      
      // Send a command to refresh the current state
      setTimeout(() => {
        // Send Ctrl+L (clear and redraw) to get fresh prompt
        session.stream.write('\x0C');
      }, 200);
    }

    console.log('Successfully reconnected to session:', sessionId);
  }

  createTerminal(ws, clientId, message) {
    const { sessionId, cols = 80, rows = 24, sshConfig } = message;
    
    console.log('Creating terminal:', sessionId);
    console.log('Connecting to:', sshConfig.host + ':' + sshConfig.port, 'as', sshConfig.username);

    const ssh = new Client();
    const session = {
      id: sessionId,
      clientId: clientId,
      ssh: ssh,
      stream: null,
      ws: ws,
      cols: cols,
      rows: rows,
      isConnected: false,
      disconnectedAt: null,
      
      // Connection details
      host: sshConfig.host,
      port: sshConfig.port,
      username: sshConfig.username,
      createdAt: new Date().toISOString(),
      name: sshConfig.username + '@' + sshConfig.host + ':' + sshConfig.port
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
      console.log('SSH connected:', sessionId);
      
      ssh.shell({
        cols: cols,
        rows: rows,
        term: 'xterm-256color'
      }, (err, stream) => {
        if (err) {
          console.error('Shell error:', err.message);
          this.sendError(ws, sessionId, 'Shell error: ' + err.message);
          this.cleanupSession(sessionId);
          return;
        }

        session.stream = stream;
        session.isConnected = true;

        // Send success response
        this.sendToSession(sessionId, {
          type: 'terminal_created', 
          sessionId: sessionId,
          shell: 'bash',
          platform: 'linux',
          cols: cols,
          rows: rows,
          host: sshConfig.host
        });

        // Handle terminal output
        stream.on('data', (data) => {
          const output = data.toString();
          
          //  STORE screen content for reconnections
          let screenContent = this.sessionScreens.get(sessionId) || '';
          screenContent += output;
          
          // Keep only last 10KB to avoid memory issues
          if (screenContent.length > 10000) {
            screenContent = screenContent.slice(-10000);
          }
          this.sessionScreens.set(sessionId, screenContent);
          this.sendToSession(sessionId, {
            type: 'terminal_output',
            sessionId: sessionId,
            data: data.toString()
          });
        });

        // Handle stream close
        stream.on('close', (code) => {
          console.log('SSH stream closed:', sessionId, '(code: ' + code + ')');
          this.sendToSession(sessionId, {
            type: 'terminal_exit',
            sessionId: sessionId,
            exitCode: code || 0
          });
          // Cleanup the session since SSH itself closed
          this.cleanupSession(sessionId);
        });

        // Handle stream errors
        stream.on('error', (err) => {
          console.error('SSH stream error:', err.message);
          this.sendError(ws, sessionId, err.message);
        });
      });
    });

    ssh.on('error', (err) => {
      clearTimeout(timeout);
      console.error('SSH connection error:', err.message);
      
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
        keepaliveInterval: 30000,
        keepaliveCountMax: 3
      });
    } catch (error) {
      console.error('SSH connect error:', error.message);
      this.sendError(ws, sessionId, error.message);
      this.cleanupSession(sessionId);
    }
  }

  /**
   * Send message to session if WebSocket is available
   */
  sendToSession(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify(message));
    } else {
      console.log('Cannot send message to session', sessionId, '- no active WebSocket');
    }
  }

  handleInput(message) {
    const { sessionId, input } = message;
    const session = this.sessions.get(sessionId);

    if (session && session.stream && session.isConnected) {
      try {
        session.stream.write(input);
      } catch (error) {
        console.error('Input error:', error.message);
      }
    } else {
      console.log('Cannot send input to session', sessionId, '- not connected');
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
        console.log('Resized', sessionId, 'to', cols + 'x' + rows);
      } catch (error) {
        console.error('Resize error:', error.message);
      }
    }
  }

  closeTerminal(sessionId) {
    console.log('Closing terminal:', sessionId);
    this.cleanupSession(sessionId);
  }

  cleanupSession(sessionId, sendNotification = true) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      if (session.stream) {
        session.stream.end();
      }
      if (session.ssh) {
        session.ssh.end();
      }
      
      if (sendNotification) {
        this.sendToSession(sessionId, {
          type: 'terminal_closed',
          sessionId: sessionId
        });
      }
    } catch (error) {
      console.error('Cleanup error:', error.message);
    }

    this.sessions.delete(sessionId);
    this.sessionScreens.delete(sessionId); //  Clean up stored content
    console.log('Session cleaned up:', sessionId);
  }

  sendError(ws, sessionId, error) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'terminal_error',
        sessionId: sessionId,
        error: error
      }));
    }
  }

  shutdown() {
    console.log('Cleaning up all sessions...');
    
    for (const sessionId of this.sessions.keys()) {
      this.cleanupSession(sessionId, false);
    }

    if (this.wss) {
      this.wss.close();
    }
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get statistics about active sessions
   */
  getSessionStats() {
    const total = this.sessions.size;
    let connected = 0;
    let disconnected = 0;
    
    for (const session of this.sessions.values()) {
      if (session.ws) {
        connected++;
      } else {
        disconnected++;
      }
    }
    
    return { total, connected, disconnected };
  }
}

// Start server
const server = new SimpleTerminalServer(3002);
server.start();

// Log session stats periodically
setInterval(() => {
  const stats = server.getSessionStats();
  if (stats.total > 0) {
    console.log('Sessions:', stats.total, 'total (' + stats.connected, 'connected,', stats.disconnected, 'disconnected)');
  }
}, 60000); // Every minute