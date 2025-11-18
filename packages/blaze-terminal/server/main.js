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
    this.sessionSubscribers = new Map(); // sessionId -> Set of clientIds
    
    // Initialize Docker
    const dockerSocketPath = process.platform === 'darwin' 
      ? `${os.homedir()}/.docker/run/docker.sock`
      : '/var/run/docker.sock';
    
    this.docker = new Docker({ socketPath: dockerSocketPath });
    console.log('🐳 Docker initialized with socket:', dockerSocketPath);
    
    this.sessionScreens = new Map(); // Buffer for reconnections
    
    // Session cleanup settings
    this.sessionTimeoutMs = 30 * 60 * 1000; // 30 minutes
    this.cleanupInterval = 5 * 60 * 1000; // 5 minutes
    
    this.startSessionCleanup();
  }

  // ===========================================
  // DOCKER HELPERS
  // ===========================================

  async getContainerInfo(type, identifier) {
    try {
      const containers = await this.docker.listContainers({ all: true });
      
      if (type === 'name') {
        const container = containers.find(c => {
          const name = c.Names[0].replace('/', '');
          return name === identifier;
        });
        if (!container) return null;
        
        const sshPort = container.Ports?.find(port => port.PrivatePort === 22);
        return {
          id: container.Id,
          name: container.Names[0].replace('/', ''),
          state: container.State,
          sshPort: sshPort?.PublicPort || null
        };
      } else if (type === 'id') {
        const container = containers.find(c => 
          c.Id === identifier || c.Id.startsWith(identifier)
        );
        if (!container) return null;
        
        const sshPort = container.Ports?.find(port => port.PrivatePort === 22);
        return {
          id: container.Id,
          name: container.Names[0].replace('/', ''),
          state: container.State,
          sshPort: sshPort?.PublicPort || null
        };
      }
    } catch (error) {
      console.error('❌ Error getting container info:', error);
      return null;
    }
  }

  // ===========================================
  // SERVER LIFECYCLE
  // ===========================================

  start() {
    // Create HTTP server for upgrade handling
    this.server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('WebSocket Terminal Server');
    });

    // Create WebSocket server (no server mode - manual upgrade)
    this.wss = new WebSocket.Server({ noServer: true });

    // Handle WebSocket upgrade requests with path-based routing
    this.server.on('upgrade', async (request, socket, head) => {
      const parsedUrl = url.parse(request.url, true);
      const pathname = parsedUrl.pathname;
      const query = parsedUrl.query;

      console.log('📥 WebSocket upgrade request:', pathname);

      // Parse path: /socket/name/container-name or /socket/id/container-id
      const pathMatch = pathname.match(/^\/socket\/(name|id)\/(.+)$/);
      
      if (pathMatch) {
        const [, type, identifier] = pathMatch;
        const method = query.method || 'docker';
        
        // Validate container exists and is running
        const containerInfo = await this.getContainerInfo(type, decodeURIComponent(identifier));
        
        if (!containerInfo) {
          console.error('❌ Container not found:', type, identifier);
          socket.write('HTTP/1.1 404 Not Found\r\n\r\nContainer not found');
          socket.destroy();
          return;
        }

        if (containerInfo.state !== 'running') {
          console.error('❌ Container not running:', containerInfo.name);
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\nContainer not running');
          socket.destroy();
          return;
        }

        console.log('✅ Container validated:', containerInfo.name, `(${method})`);

        // Perform WebSocket upgrade
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          ws.containerInfo = containerInfo;
          ws.connectionMethod = method;
          this.wss.emit('connection', ws, request);
        });
      } else {
        console.error('❌ Invalid path:', pathname);
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\nPath required: /socket/name/{container} or /socket/id/{container}');
        socket.destroy();
      }
    });

    // Handle WebSocket connections
    this.wss.on('connection', (ws, request) => {
      const clientId = this.generateId();
      this.clients.set(clientId, ws);
      
      // All connections must have container info
      if (!ws.containerInfo) {
        console.error('❌ No container info - rejecting');
        ws.close(1008, 'Container info required');
        return;
      }

      console.log('🔌 Client connected:', clientId, '→', ws.containerInfo.name);

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
          console.error('❌ Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        console.log('🔌 Client disconnected:', clientId);
        this.markClientSessionsAsDisconnected(clientId);
        this.clients.delete(clientId);
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', clientId, error.message);
      });
    });

    // Start HTTP server
    this.server.listen(this.port);
    console.log('🚀 Terminal server started on port', this.port);

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down...');
      this.shutdown();
      process.exit(0);
    });
  }

  // ===========================================
  // SESSION MANAGEMENT
  // ===========================================

  markClientSessionsAsDisconnected(clientId) {
    this.sessionSubscribers.forEach((subscribers, sessionId) => {
      if (subscribers.has(clientId)) {
        subscribers.delete(clientId);
        
        if (subscribers.size === 0) {
          const session = this.sessions.get(sessionId);
          if (session) {
            session.disconnectedAt = new Date();
            console.log('⏰ Session marked for cleanup:', sessionId);
          }
        }
      }
    });
  }

  startSessionCleanup() {
    setInterval(() => {
      const now = new Date();
      let cleanedCount = 0;
      
      for (const [sessionId, session] of this.sessions.entries()) {
        if (!session.ws && session.disconnectedAt) {
          const timeSinceDisconnect = now - session.disconnectedAt;
          if (timeSinceDisconnect > this.sessionTimeoutMs) {
            this.cleanupSession(sessionId, false);
            cleanedCount++;
          }
        }
      }
      
      if (cleanedCount > 0) {
        console.log('🧹 Cleaned up', cleanedCount, 'old sessions');
      }
    }, this.cleanupInterval);
  }

  // ===========================================
  // MESSAGE HANDLERS
  // ===========================================

  handleMessage(ws, clientId, message) {
    switch (message.type) {
      case 'create_terminal':
        this.createTerminal(ws, clientId, message);
        break;
      case 'list_sessions':
        this.listSessions(ws, clientId);
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
      default:
        console.log('⚠️ Unknown message type:', message.type);
    }
  }

  listSessions(ws, clientId) {
    const activeSessions = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.isConnected) {
        activeSessions.push({
          sessionId: sessionId,
          title: session.name || `Terminal ${sessionId.substr(0, 8)}`,
          method: session.method || 'ssh',
          host: session.host,
          username: session.username,
          containerName: session.containerName,
          cols: session.cols,
          rows: session.rows,
          createdAt: session.createdAt
        });
      }
    }
    
    console.log('📋 Listing', activeSessions.length, 'active sessions for client:', clientId);
    
    ws.send(JSON.stringify({
      type: 'existing_sessions',
      sessions: activeSessions
    }));
  }

  reconnectSession(ws, clientId, sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.isConnected) {
      console.log('❌ Session not found:', sessionId);
      ws.send(JSON.stringify({
        type: 'session_not_found',
        sessionId: sessionId
      }));
      return;
    }
    
    // Subscribe this client to the session
    if (!this.sessionSubscribers.has(sessionId)) {
      this.sessionSubscribers.set(sessionId, new Set());
    }
    this.sessionSubscribers.get(sessionId).add(clientId);
    session.disconnectedAt = null;
    
    console.log('🔄 Client subscribed to session:', sessionId, 
                `(${this.sessionSubscribers.get(sessionId).size} subscribers)`);
    
    ws.send(JSON.stringify({
      type: 'session_reconnected',
      sessionId: sessionId,
      title: session.name,
      method: session.method,
      host: session.host,
      username: session.username,
      containerName: session.containerName,
      cols: session.cols,
      rows: session.rows
    }));
    
    // Send buffered output
    const bufferedOutput = this.sessionScreens.get(sessionId);
    if (bufferedOutput) {
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'terminal_output',
          sessionId: sessionId,
          data: bufferedOutput
        }));
      }, 200);
    }
  }

  // ===========================================
  // TERMINAL CREATION
  // ===========================================

  createTerminal(ws, clientId, message) {
    const { sessionId, cols = 80, rows = 24, sshConfig } = message;
    const method = ws.connectionMethod || 'docker';
    const containerInfo = ws.containerInfo;

    console.log('🖥️  Creating terminal:', method, '→', containerInfo.name);

    if (method === 'docker' && containerInfo) {
      this.createDockerTerminal(ws, clientId, sessionId, containerInfo, cols, rows);
    } else if (method === 'ssh') {
      if (!sshConfig) {
        this.sendError(ws, sessionId, 'SSH config required for SSH method');
        return;
      }
      this.createSSHTerminal(ws, clientId, sessionId, sshConfig, cols, rows);
    } else {
      this.sendError(ws, sessionId, 'Invalid connection configuration');
    }
  }

  createDockerTerminal(ws, clientId, sessionId, containerInfo, cols, rows) {
    const container = this.docker.getContainer(containerInfo.id);
    const session = {
      id: sessionId,
      method: 'docker',
      container: container,
      exec: null,
      stream: null,
      cols: cols,
      rows: rows,
      isConnected: false,
      disconnectedAt: null,
      containerId: containerInfo.id,
      containerName: containerInfo.name,
      createdAt: new Date().toISOString(),
      name: `docker:${containerInfo.name}`
    };

    this.sessions.set(sessionId, session);
    
    // Subscribe client
    if (!this.sessionSubscribers.has(sessionId)) {
      this.sessionSubscribers.set(sessionId, new Set());
    }
    this.sessionSubscribers.get(sessionId).add(clientId);

    // Create Docker exec instance
    container.exec({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Env: ['TERM=xterm-256color'],
      Cmd: ['/bin/bash']
    }, (err, exec) => {
      if (err) {
        console.error('❌ Docker exec creation failed:', err.message);
        this.sendError(ws, sessionId, 'Failed to create terminal: ' + err.message);
        this.cleanupSession(sessionId);
        return;
      }

      session.exec = exec;

      exec.start({ hijack: true, stdin: true, Tty: true }, (err, stream) => {
        if (err) {
          console.error('❌ Docker exec start failed:', err.message);
          this.sendError(ws, sessionId, 'Failed to start terminal: ' + err.message);
          this.cleanupSession(sessionId);
          return;
        }

        session.stream = stream;
        session.isConnected = true;

        // Resize terminal
        container.resize({
          h: rows,
          w: cols,
          id: exec.id
        }).catch(err => console.error('⚠️ Resize error:', err.message));

        // Send success
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

        // Handle output
        stream.on('data', (data) => {
          const output = data.toString();
          
          // Buffer output (keep last 10KB)
          let screenContent = this.sessionScreens.get(sessionId) || '';
          screenContent += output;
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

        stream.on('end', () => {
          console.log('🔚 Docker exec stream ended:', sessionId);
          this.sendToSession(sessionId, {
            type: 'terminal_exit',
            sessionId: sessionId,
            exitCode: 0
          });
          this.cleanupSession(sessionId);
        });

        stream.on('error', (err) => {
          console.error('❌ Docker exec stream error:', err.message);
          this.sendError(ws, sessionId, err.message);
        });
      });
    });
  }

  createSSHTerminal(ws, clientId, sessionId, sshConfig, cols, rows) {
    const ssh = new Client();
    const session = {
      id: sessionId,
      method: 'ssh',
      ssh: ssh,
      stream: null,
      cols: cols,
      rows: rows,
      isConnected: false,
      disconnectedAt: null,
      host: sshConfig.host,
      port: sshConfig.port,
      username: sshConfig.username,
      createdAt: new Date().toISOString(),
      name: `${sshConfig.username}@${sshConfig.host}:${sshConfig.port}`
    };

    this.sessions.set(sessionId, session);
    
    // Subscribe client
    if (!this.sessionSubscribers.has(sessionId)) {
      this.sessionSubscribers.set(sessionId, new Set());
    }
    this.sessionSubscribers.get(sessionId).add(clientId);

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
          console.error('❌ SSH shell error:', err.message);
          this.sendError(ws, sessionId, 'Shell error: ' + err.message);
          this.cleanupSession(sessionId);
          return;
        }

        session.stream = stream;
        session.isConnected = true;

        this.sendToSession(sessionId, {
          type: 'terminal_created', 
          sessionId: sessionId,
          method: 'ssh',
          shell: 'bash',
          platform: 'linux',
          cols: cols,
          rows: rows,
          host: sshConfig.host
        });

        stream.on('data', (data) => {
          const output = data.toString();
          
          // Buffer output
          let screenContent = this.sessionScreens.get(sessionId) || '';
          screenContent += output;
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

        stream.on('close', (code) => {
          console.log('🔚 SSH stream closed:', sessionId);
          this.sendToSession(sessionId, {
            type: 'terminal_exit',
            sessionId: sessionId,
            exitCode: code || 0
          });
          this.cleanupSession(sessionId);
        });

        stream.on('error', (err) => {
          console.error('❌ SSH stream error:', err.message);
          this.sendError(ws, sessionId, err.message);
        });
      });
    });

    ssh.on('error', (err) => {
      clearTimeout(timeout);
      console.error('❌ SSH connection error:', err.message);
      
      let errorMessage = 'Connection failed';
      if (err.code === 'ENOTFOUND') errorMessage = 'Host not found';
      else if (err.code === 'ECONNREFUSED') errorMessage = 'Connection refused';
      else if (err.message.includes('authentication')) errorMessage = 'Authentication failed';
      else if (err.message.includes('timeout')) errorMessage = 'Connection timeout';
      
      this.sendError(ws, sessionId, errorMessage);
      this.cleanupSession(sessionId);
    });

    // Connect
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
      console.error('❌ SSH connect error:', error.message);
      this.sendError(ws, sessionId, error.message);
      this.cleanupSession(sessionId);
    }
  }

  // ===========================================
  // I/O HANDLERS
  // ===========================================

  sendToSession(sessionId, message) {
    const subscribers = this.sessionSubscribers.get(sessionId);
    if (!subscribers || subscribers.size === 0) return;
    
    const messageStr = JSON.stringify(message);
    let sentCount = 0;
    
    subscribers.forEach(clientId => {
      const ws = this.clients.get(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
        sentCount++;
      }
    });
  }

  handleInput(message) {
    const { sessionId, input } = message;
    const session = this.sessions.get(sessionId);

    if (session && session.stream && session.isConnected) {
      try {
        session.stream.write(input);
      } catch (error) {
        console.error('❌ Input error:', error.message);
      }
    }
  }

  resizeTerminal(message) {
    const { sessionId, cols, rows } = message;
    const session = this.sessions.get(sessionId);

    if (session && session.stream) {
      try {
        if (session.method === 'docker') {
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
            }).catch(error => {
              console.error('❌ Docker resize error:', error.message);
            });
          }
        } else {
          session.stream.setWindow(rows, cols);
          session.cols = cols;
          session.rows = rows;
        }
      } catch (error) {
        console.error('❌ Resize error:', error.message);
      }
    }
  }

  closeTerminal(sessionId) {
    this.cleanupSession(sessionId);
  }

  // ===========================================
  // CLEANUP
  // ===========================================

  cleanupSession(sessionId, sendNotification = true) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      if (session.stream) session.stream.end();
      if (session.ssh) session.ssh.end();
      
      if (sendNotification) {
        this.sendToSession(sessionId, {
          type: 'terminal_closed',
          sessionId: sessionId
        });
      }
    } catch (error) {
      console.error('❌ Cleanup error:', error.message);
    }

    this.sessions.delete(sessionId);
    this.sessionScreens.delete(sessionId);
    this.sessionSubscribers.delete(sessionId);
    console.log('🧹 Session cleaned up:', sessionId);
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
    console.log('🧹 Cleaning up all sessions...');
    
    for (const sessionId of this.sessions.keys()) {
      this.cleanupSession(sessionId, false);
    }

    if (this.wss) this.wss.close();
    if (this.server) this.server.close();
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  getSessionStats() {
    const total = this.sessions.size;
    let connected = 0;
    let disconnected = 0;
    let totalSubscribers = 0;
    
    this.sessions.forEach((session, sessionId) => {
      const subscribers = this.sessionSubscribers.get(sessionId);
      const subscriberCount = subscribers ? subscribers.size : 0;
      
      if (subscriberCount > 0) {
        connected++;
        totalSubscribers += subscriberCount;
      } else {
        disconnected++;
      }
    });
    
    return { total, connected, disconnected, totalSubscribers };
  }
}

// Start server
const server = new SimpleTerminalServer(3002);
server.start();

// Log session stats periodically
setInterval(() => {
  const stats = server.getSessionStats();
  if (stats.total > 0) {
    console.log('📊 Sessions:', stats.total, 'total,', stats.connected, 'active,', 
                stats.disconnected, 'idle,', stats.totalSubscribers, 'subscribers');
  }
}, 60000);