const WebSocket = require('ws');
const { Client } = require('ssh2');
const http = require('http');
const url = require('url');
const Docker = require('dockerode');
const os = require('os');

class SimpleTerminalServer {
  constructor(port = 8080) {
    this.port = port;
    this.server = null;
    this.wss = null;
    this.sessions = new Map();
    this.clients = new Map();
    
    // Initialize Docker with proper socket path for macOS
    const dockerSocketPath = process.platform === 'darwin' 
      ? `${os.homedir()}/.docker/run/docker.sock`
      : '/var/run/docker.sock';
    
    this.docker = new Docker({ socketPath: dockerSocketPath });
    console.log('Docker initialized with socket:', dockerSocketPath);
    
    this.sessionScreens = new Map();
    // Session cleanup settings
    this.sessionTimeoutMs = 30 * 60 * 1000; // 30 minutes before cleanup
    this.cleanupInterval = 5 * 60 * 1000; // Check every 5 minutes
    
    // Start periodic cleanup
    this.startSessionCleanup();
  }

  async getContainerInfo(type, identifier) {
    try {
      const containers = await this.docker.listContainers({ all: true });
      
      if (type === 'name') {
        const container = containers.find(c => {
          const name = c.Names[0].replace('/', '');
          return name === identifier;
        });
        if (!container) return null;
        
        const sshPort = container.Ports && container.Ports.length > 0
          ? container.Ports.find(port => port.PrivatePort === 22)
          : null;
        return {
          id: container.Id,
          name: container.Names[0].replace('/', ''),
          state: container.State,
          sshPort: sshPort ? sshPort.PublicPort : null
        };
      } else if (type === 'id') {
        const container = containers.find(c => 
          c.Id === identifier || c.Id.startsWith(identifier)
        );
        if (!container) return null;
        
        const sshPort = container.Ports && container.Ports.length > 0
          ? container.Ports.find(port => port.PrivatePort === 22)
          : null;
        return {
          id: container.Id,
          name: container.Names[0].replace('/', ''),
          state: container.State,
          sshPort: sshPort ? sshPort.PublicPort : null
        };
      }
    } catch (error) {
      console.error('Error getting container info:', error);
      return null;
    }
  }

  start() {
    // Create HTTP server for WebSocket upgrade handling
    this.server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('WebSocket Terminal Server');
    });

    // Create WebSocket server (no server mode)
    this.wss = new WebSocket.Server({ noServer: true });
    console.log('Terminal server started on port', this.port);

    // Handle WebSocket upgrade requests
    this.server.on('upgrade', async (request, socket, head) => {
      const parsedUrl = url.parse(request.url, true);
      const pathname = parsedUrl.pathname;
      const query = parsedUrl.query;

      console.log('WebSocket upgrade request:', pathname, query);

      // Parse path: /socket/name/container-name or /socket/id/container-id
      const pathMatch = pathname.match(/^\/socket\/(name|id)\/(.+)$/);
      
      if (pathMatch) {
        const [, type, identifier] = pathMatch;
        const method = query.method || 'docker'; // Default to Docker exec
        
        // Validate container exists
        const containerInfo = await this.getContainerInfo(type, decodeURIComponent(identifier));
        
        if (!containerInfo) {
          console.error('Container not found:', type, identifier);
          socket.write('HTTP/1.1 404 Not Found\r\n\r\nContainer not found');
          socket.destroy();
          return;
        }

        if (containerInfo.state !== 'running') {
          console.error('Container not running:', containerInfo.name);
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\nContainer not running');
          socket.destroy();
          return;
        }

        console.log('Upgrading connection for container:', containerInfo.name, 'method:', method);

        // Perform WebSocket upgrade
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          // Attach container info and method to WebSocket
          ws.containerInfo = containerInfo;
          ws.connectionMethod = method;
          this.wss.emit('connection', ws, request);
        });
      } else {
        // Reject connections without proper path
        console.error('Invalid WebSocket path:', pathname);
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\nPath-based routing required. Use /socket/name/{container-name} or /socket/id/{container-id}');
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws, request) => {
      const clientId = this.generateId();
      this.clients.set(clientId, ws);
      
      // All connections must have container info (path-based routing required)
      if (!ws.containerInfo) {
        console.error('Connection rejected - no container info (path required)');
        ws.close(1008, 'Path-based routing required');
        return;
      }

      console.log('Client connected:', clientId, '→', ws.containerInfo.name, '(' + ws.connectionMethod + ')');

      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        clientId: clientId,
        containerInfo: ws.containerInfo,
        connectionMethod: ws.connectionMethod
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

    // Start HTTP server
    this.server.listen(this.port);

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
    
    if (!session || !session.isConnected) {
      console.log('Session not found or disconnected:', sessionId);
      ws.send(JSON.stringify({
        type: 'session_not_found',
        sessionId: sessionId
      }));
      return;
    }
    
    session.ws = ws;
    session.clientId = clientId;
    session.disconnectedAt = null;
    
    ws.send(JSON.stringify({
      type: 'session_reconnected',
      sessionId: sessionId,
      title: session.name || 'Terminal ' + sessionId.substr(0, 8),
      method: session.method || 'ssh',
      host: session.host,
      username: session.username,
      containerName: session.containerName,
      cols: session.cols,
      rows: session.rows
    }));
    
    if (session.stream && session.isConnected) {
      setTimeout(() => {
        session.stream.write('\x0C');
      }, 200);
    }
  }

  createTerminal(ws, clientId, message) {
    const { sessionId, cols = 80, rows = 24, sshConfig } = message;
    
    const method = ws.connectionMethod || 'docker';
    const containerInfo = ws.containerInfo;

    if (method === 'docker' && containerInfo) {
      this.createDockerTerminal(ws, clientId, sessionId, containerInfo, cols, rows);
    } else if (method === 'ssh') {
      if (!sshConfig) {
        console.error('SSH method requires sshConfig');
        this.sendError(ws, sessionId, 'SSH configuration required for SSH method');
        return;
      }
      this.createSSHTerminal(ws, clientId, sessionId, sshConfig, cols, rows);
    } else {
      console.error('Invalid method or missing container info');
      this.sendError(ws, sessionId, 'Invalid connection configuration');
    }
  }

  createDockerTerminal(ws, clientId, sessionId, containerInfo, cols, rows) {
    const container = this.docker.getContainer(containerInfo.id);
    const session = {
      id: sessionId,
      clientId: clientId,
      method: 'docker',
      container: container,
      exec: null,
      stream: null,
      ws: ws,
      cols: cols,
      rows: rows,
      isConnected: false,
      disconnectedAt: null,
      
      // Connection details
      containerId: containerInfo.id,
      containerName: containerInfo.name,
      createdAt: new Date().toISOString(),
      name: 'docker:' + containerInfo.name
    };

    this.sessions.set(sessionId, session);

    // Create exec instance
    container.exec({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Env: ['TERM=xterm-256color'],
      Cmd: ['/bin/bash']
    }, (err, exec) => {
      if (err) {
        console.error('Docker exec creation error:', err.message);
        this.sendError(ws, sessionId, 'Failed to create terminal: ' + err.message);
        this.cleanupSession(sessionId);
        return;
      }

      session.exec = exec;

      // Start the exec instance
      exec.start({
        hijack: true,
        stdin: true,
        Tty: true
      }, (err, stream) => {
        if (err) {
          console.error('Docker exec start error:', err.message);
          this.sendError(ws, sessionId, 'Failed to start terminal: ' + err.message);
          this.cleanupSession(sessionId);
          return;
        }

        session.stream = stream;
        session.isConnected = true;

        container.resize({
          h: rows,
          w: cols,
          id: exec.id
        }).catch(err => {
          console.error('Resize error:', err.message);
        });

        this.sendToSession(sessionId, {
          type: 'terminal_created',
          sessionId: sessionId,
          method: 'docker',
          shell: 'bash',
          platform: 'linux',
          cols: cols,
          rows: rows,
          containerName: containerInfo.name
        });

        // Handle terminal output
        stream.on('data', (data) => {
          const output = data.toString();
          
          // Store screen content for reconnections
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
            data: output
          });
        });

        // Handle stream close
        stream.on('end', () => {
          console.log('Docker exec stream closed:', sessionId);
          this.sendToSession(sessionId, {
            type: 'terminal_exit',
            sessionId: sessionId,
            exitCode: 0
          });
          this.cleanupSession(sessionId);
        });

        // Handle stream errors
        stream.on('error', (err) => {
          console.error('Docker exec stream error:', err.message);
          this.sendError(ws, sessionId, err.message);
        });
      });
    });
  }

  createSSHTerminal(ws, clientId, sessionId, sshConfig, cols, rows) {
    const ssh = new Client();
    const session = {
      id: sessionId,
      clientId: clientId,
      method: 'ssh',
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
        if (session.method === 'docker') {
          // Docker exec resize
          const container = session.container;
          const exec = session.exec;
          if (container && exec) {
            container.resize({
              h: rows,
              w: cols,
              id: exec.id
            }).then(() => {
              session.cols = cols;
              session.rows = rows;
              console.log('Resized (docker)', sessionId, 'to', cols + 'x' + rows);
            }).catch(error => {
              console.error('Docker resize error:', error.message);
            });
          }
        } else {
          // SSH resize
          session.stream.setWindow(rows, cols);
          session.cols = cols;
          session.rows = rows;
          console.log('Resized (ssh)', sessionId, 'to', cols + 'x' + rows);
        }
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
      if (session.exec) {
        // Docker exec cleanup - stream end is sufficient
        console.log('Cleaned up Docker exec:', sessionId);
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