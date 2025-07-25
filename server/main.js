// server/main.js - WebSocket terminal server
import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import WebSocket from 'ws';
import { spawn } from 'child_process';
import os from 'os';

// Store active terminal sessions
const terminalSessions = new Map();
let wss = null;

Meteor.startup(() => {
  console.log('Terminal App Server Started!');
  console.log('Setting up WebSocket server...');
  
  // Create WebSocket server
  const server = WebApp.httpServer;
  wss = new WebSocket.Server({ 
    port: 8080,
    perMessageDeflate: false 
  });
  
  console.log('WebSocket server listening on port 8080');
  
  // Handle new WebSocket connections
  wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection from:', req.socket.remoteAddress);
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        handleWebSocketMessage(ws, data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket connection closed');
      // Clean up any sessions for this connection
      cleanupSessionsForConnection(ws);
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket connected to terminal server'
    }));
  });
  
  // Cleanup on server shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down server...');
    terminalSessions.forEach((session) => {
      if (session.shell && !session.shell.killed) {
        session.shell.kill();
      }
    });
    if (wss) {
      wss.close();
    }
    process.exit(0);
  });
});

/**
 * Handle incoming WebSocket messages
 */
function handleWebSocketMessage(ws, data) {
  switch (data.type) {
    case 'create_terminal':
      createTerminalSession(ws, data);
      break;
      
    case 'terminal_input':
      handleTerminalInput(ws, data);
      break;
      
    case 'resize_terminal':
      resizeTerminal(ws, data);
      break;
      
    case 'close_terminal':
      closeTerminalSession(ws, data);
      break;
      
    default:
      console.log('Unknown message type:', data.type);
  }
}

/**
 * Create a new terminal session
 */
function createTerminalSession(ws, data) {
  const sessionId = data.sessionId;
  const { cols = 80, rows = 24 } = data;
  
  console.log(`Creating terminal session: ${sessionId}`);
  
  try {
    // Determine shell based on platform
    const isWindows = os.platform() === 'win32';
    const shell = isWindows ? 'cmd.exe' : 'bash';
    const shellArgs = isWindows ? [] : [];
    
    // Spawn the shell process
    const ptyProcess = spawn(shell, shellArgs, {
      cwd: os.homedir(),
      env: {
        ...process.env,
        TERM: 'xterm-color',
        COLORTERM: 'truecolor',
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Store session
    terminalSessions.set(sessionId, {
      shell: ptyProcess,
      ws: ws,
      sessionId: sessionId
    });
    
    // Handle shell output
    ptyProcess.stdout.on('data', (data) => {
      ws.send(JSON.stringify({
        type: 'terminal_output',
        sessionId: sessionId,
        data: data.toString()
      }));
    });
    
    ptyProcess.stderr.on('data', (data) => {
      ws.send(JSON.stringify({
        type: 'terminal_output',
        sessionId: sessionId,
        data: data.toString()
      }));
    });
    
    // Handle shell exit
    ptyProcess.on('exit', (code) => {
      console.log(`Terminal session ${sessionId} exited with code ${code}`);
      ws.send(JSON.stringify({
        type: 'terminal_exit',
        sessionId: sessionId,
        exitCode: code
      }));
      terminalSessions.delete(sessionId);
    });
    
    ptyProcess.on('error', (error) => {
      console.error(`Terminal session ${sessionId} error:`, error);
      ws.send(JSON.stringify({
        type: 'terminal_error',
        sessionId: sessionId,
        error: error.message
      }));
    });
    
    // Send success response
    ws.send(JSON.stringify({
      type: 'terminal_created',
      sessionId: sessionId,
      shell: shell,
      platform: os.platform()
    }));
    
  } catch (error) {
    console.error('Error creating terminal session:', error);
    ws.send(JSON.stringify({
      type: 'terminal_error',
      sessionId: sessionId,
      error: error.message
    }));
  }
}

/**
 * Handle input to terminal
 */
function handleTerminalInput(ws, data) {
  const { sessionId, input } = data;
  const session = terminalSessions.get(sessionId);
  
  if (session && session.shell && !session.shell.killed) {
    try {
      session.shell.stdin.write(input);
    } catch (error) {
      console.error(`Error writing to terminal ${sessionId}:`, error);
      ws.send(JSON.stringify({
        type: 'terminal_error',
        sessionId: sessionId,
        error: error.message
      }));
    }
  } else {
    ws.send(JSON.stringify({
      type: 'terminal_error',
      sessionId: sessionId,
      error: 'Terminal session not found or closed'
    }));
  }
}

/**
 * Resize terminal
 */
function resizeTerminal(ws, data) {
  const { sessionId, cols, rows } = data;
  const session = terminalSessions.get(sessionId);
  
  if (session && session.shell && !session.shell.killed) {
    // Note: For real pty support, you'd use ptyProcess.resize(cols, rows)
    // Since we're using regular spawn, we can't resize, but we acknowledge
    ws.send(JSON.stringify({
      type: 'terminal_resized',
      sessionId: sessionId,
      cols: cols,
      rows: rows
    }));
  }
}

/**
 * Close terminal session
 */
function closeTerminalSession(ws, data) {
  const { sessionId } = data;
  const session = terminalSessions.get(sessionId);
  
  if (session) {
    console.log(`Closing terminal session: ${sessionId}`);
    
    if (session.shell && !session.shell.killed) {
      session.shell.kill('SIGTERM');
    }
    
    terminalSessions.delete(sessionId);
    
    ws.send(JSON.stringify({
      type: 'terminal_closed',
      sessionId: sessionId
    }));
  }
}

/**
 * Clean up sessions for a disconnected WebSocket
 */
function cleanupSessionsForConnection(ws) {
  const sessionsToRemove = [];
  
  terminalSessions.forEach((session, sessionId) => {
    if (session.ws === ws) {
      sessionsToRemove.push(sessionId);
    }
  });
  
  sessionsToRemove.forEach(sessionId => {
    const session = terminalSessions.get(sessionId);
    if (session && session.shell && !session.shell.killed) {
      session.shell.kill('SIGTERM');
    }
    terminalSessions.delete(sessionId);
    console.log(`Cleaned up terminal session: ${sessionId}`);
  });
}

// Export for potential use in other files
export { terminalSessions, wss };