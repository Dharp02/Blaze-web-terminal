// imports/ui/terminal.js - WebSocket version with fixed onData handling
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Random } from 'meteor/random';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

import './terminal.html';

// Terminal state
const terminals = new ReactiveVar([]);
const activeTerminalId = new ReactiveVar(null);
const isTerminalVisible = new ReactiveVar(true);

// Terminal instances and WebSocket connections
const terminalInstances = new Map();
const terminalSessions = new Map();

// WebSocket connection
let websocket = null;
let isConnecting = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

Template.terminal.onCreated(function() {
  console.log('Terminal created, connecting to WebSocket...');
  
  // Connect to WebSocket server
  connectWebSocket();
  
  // Initialize with one terminal after WebSocket connects OR after timeout
  this.autorun(() => {
    const terminalCount = terminals.get().length;
    const wsReady = websocket && websocket.readyState === WebSocket.OPEN;
    
    // Create terminal if none exist and either WebSocket is ready OR after 2 seconds
    if (terminalCount === 0) {
      if (wsReady) {
        console.log('WebSocket ready, creating terminal');
        addNewTerminal();
      } else {
        // Create fallback terminal after delay if WebSocket fails
        Meteor.setTimeout(() => {
          if (terminals.get().length === 0) {
            console.log('WebSocket not ready, creating fallback terminal');
            addNewTerminal();
          }
        }, 2000);
      }
    }
  });
});

Template.terminal.helpers({
  isTerminalVisible() {
    return isTerminalVisible.get();
  },
  
  terminals() {
    return terminals.get().map(term => ({
      ...term,
      isActive: term.id === activeTerminalId.get()
    }));
  }
});

Template.terminal.events({
  'click .add-terminal'(event) {
    event.preventDefault();
    addNewTerminal();
  },
  
  'click .terminal-tab'(event) {
    const terminalId = event.currentTarget.dataset.id;
    setActiveTerminal(terminalId);
  },
  
  'click .close-tab'(event) {
    event.stopPropagation();
    const terminalId = event.currentTarget.dataset.id;
    closeTerminal(terminalId);
  },
  
  'click #close-terminal'() {
    isTerminalVisible.set(false);
  },
  
  'click .terminal-toggle'() {
    isTerminalVisible.set(true);
  },
  
  'mousedown .resize-handle'(event) {
    startResize(event);
  }
});

Template.terminal.onRendered(function() {
  console.log('Terminal template rendered');
  
  this.autorun(() => {
    const terminalList = terminals.get();
    terminalList.forEach(term => {
      if (!terminalInstances.has(term.id)) {
        console.log('Initializing terminal:', term.id);
        initializeTerminal(term.id);
      }
    });
  });
  
  window.addEventListener('resize', fitAllTerminals);
});

Template.terminal.onDestroyed(function() {
  // Close WebSocket connection
  if (websocket) {
    websocket.close();
  }
  
  // Clean up all terminal instances
  terminalInstances.forEach(term => term.dispose());
  terminalInstances.clear();
  terminalSessions.clear();
});

/**
 * Connect to WebSocket server
 */
function connectWebSocket() {
  if (isConnecting || (websocket && websocket.readyState === WebSocket.OPEN)) {
    return;
  }
  
  isConnecting = true;
  console.log('Connecting to WebSocket server ws://localhost:8080...');
  
  try {
    websocket = new WebSocket('ws://localhost:8080');
    
    websocket.onopen = () => {
      console.log('✅ WebSocket connected successfully');
      isConnecting = false;
      reconnectAttempts = 0;
    };
    
    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data.type);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    websocket.onclose = (event) => {
      console.log(`❌ WebSocket connection closed: ${event.code} - ${event.reason}`);
      isConnecting = false;
      
      // Update existing terminals to show disconnection
      showWebSocketError('Connection lost');
      
      // Attempt to reconnect
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
        setTimeout(connectWebSocket, 2000 * reconnectAttempts);
      } else {
        console.error('Max reconnection attempts reached');
        showWebSocketError('Connection failed - running in offline mode');
      }
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      isConnecting = false;
      showWebSocketError('WebSocket error');
    };
    
  } catch (error) {
    console.error('Error creating WebSocket:', error);
    isConnecting = false;
  }
}

/**
 * Handle messages from WebSocket server
 */
function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'connected':
      console.log('Server connection confirmed');
      break;
      
    case 'terminal_created':
      handleTerminalCreated(data);
      break;
      
    case 'terminal_output':
      handleTerminalOutput(data);
      break;
      
    case 'terminal_exit':
      handleTerminalExit(data);
      break;
      
    case 'terminal_error':
      handleTerminalError(data);
      break;
      
    case 'terminal_closed':
      console.log(`Terminal ${data.sessionId} closed on server`);
      break;
      
    default:
      console.log('Unknown message type:', data.type);
  }
}

/**
 * Handle terminal creation response
 */
function handleTerminalCreated(data) {
  const { sessionId, shell, platform } = data;
  console.log(`✅ Server created terminal: ${sessionId} (${shell} on ${platform})`);
  
  const terminalInstance = terminalInstances.get(sessionId);
  if (terminalInstance) {
    terminalInstance.clear();
    terminalInstance.writeln(`\x1b[1;32m● Connected to ${shell} on ${platform}\x1b[0m`);
    terminalInstance.writeln('');
    
    // Mark this session as connected
    terminalSessions.set(sessionId, { connected: true, shell, platform });
  }
}

/**
 * Handle output from terminal
 */
function handleTerminalOutput(data) {
  const { sessionId, data: output } = data;
  const terminalInstance = terminalInstances.get(sessionId);
  
  if (terminalInstance) {
    terminalInstance.write(output);
  }
}

/**
 * Handle terminal exit
 */
function handleTerminalExit(data) {
  const { sessionId, exitCode } = data;
  const terminalInstance = terminalInstances.get(sessionId);
  
  if (terminalInstance) {
    terminalInstance.writeln(`\r\n\x1b[1;31m● Process exited with code ${exitCode}\x1b[0m`);
    terminalInstance.writeln('\x1b[1;33m● Press Enter to restart or close this terminal\x1b[0m');
  }
  
  // Remove from sessions
  terminalSessions.delete(sessionId);
}

/**
 * Handle terminal errors
 */
function handleTerminalError(data) {
  const { sessionId, error } = data;
  const terminalInstance = terminalInstances.get(sessionId);
  
  if (terminalInstance) {
    terminalInstance.writeln(`\r\n\x1b[1;31m● Error: ${error}\x1b[0m`);
  }
  
  console.error(`Terminal ${sessionId} error:`, error);
}

/**
 * Show WebSocket error in all terminals
 */
function showWebSocketError(message) {
  console.log('Showing WebSocket error to user:', message);
  
  terminalInstances.forEach(term => {
    term.writeln(`\r\n\x1b[1;31m● ${message}\x1b[0m`);
    term.writeln('\x1b[1;33m● Terminal now running in offline mode\x1b[0m');
    term.write('$ ');
  });
}

/**
 * Creates a new terminal
 */
function addNewTerminal() {
  console.log('Adding new terminal...');
  
  const newId = Random.id();
  const currentTerminals = terminals.get();
  
  const newTerminal = {
    id: newId,
    title: `Terminal ${currentTerminals.length + 1}`,
    isActive: true
  };
  
  // Set all other terminals as inactive
  const updatedTerminals = currentTerminals.map(t => ({
    ...t,
    isActive: false
  }));
  
  terminals.set([...updatedTerminals, newTerminal]);
  activeTerminalId.set(newId);
  
  // Request server to create terminal session if WebSocket is connected
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    console.log('Requesting server to create terminal session');
    websocket.send(JSON.stringify({
      type: 'create_terminal',
      sessionId: newId,
      cols: 80,
      rows: 24
    }));
  } else {
    console.log('WebSocket not available, terminal will run in offline mode');
  }
}

/**
 * Sets the active terminal
 */
function setActiveTerminal(terminalId) {
  const currentTerminals = terminals.get();
  const updatedTerminals = currentTerminals.map(t => ({
    ...t,
    isActive: t.id === terminalId
  }));
  
  terminals.set(updatedTerminals);
  activeTerminalId.set(terminalId);
  
  // Focus the terminal
  Meteor.setTimeout(() => {
    const terminalInstance = terminalInstances.get(terminalId);
    if (terminalInstance) {
      terminalInstance.focus();
    }
  }, 100);
}

/**
 * Closes a terminal
 */
function closeTerminal(terminalId) {
  const currentTerminals = terminals.get();
  
  if (currentTerminals.length === 1) {
    return; // Don't close the last terminal
  }
  
  const filteredTerminals = currentTerminals.filter(t => t.id !== terminalId);
  
  // Close server session if WebSocket is available
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({
      type: 'close_terminal',
      sessionId: terminalId
    }));
  }
  
  // Dispose of the terminal instance
  const terminalInstance = terminalInstances.get(terminalId);
  if (terminalInstance) {
    terminalInstance.dispose();
    terminalInstances.delete(terminalId);
  }
  
  terminalSessions.delete(terminalId);
  terminals.set(filteredTerminals);
  
  // Set a new active terminal if the closed one was active
  if (activeTerminalId.get() === terminalId && filteredTerminals.length > 0) {
    setActiveTerminal(filteredTerminals[0].id);
  }
}

/**
 * Initializes a new xterm.js terminal instance
 */
function initializeTerminal(terminalId) {
  console.log('Initializing terminal:', terminalId);
  
  Meteor.setTimeout(() => {
    const container = document.getElementById(`terminal-${terminalId}`);
    if (!container) {
      console.error('❌ Container not found:', `terminal-${terminalId}`);
      return;
    }
    
    console.log('✅ Container found, creating terminal instance');
    
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", "Consolas", "Courier New", monospace',
      lineHeight: 1.2,
      letterSpacing: 0,
      rows: 24,
      cols: 80,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selection: '#264f78',
        black: '#000000',
        red: '#f44747',
        green: '#608b4e',
        yellow: '#ffcc02',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#666666',
        brightRed: '#f44747',
        brightGreen: '#608b4e',
        brightYellow: '#ffcc02',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#4ec9b0',
        brightWhite: '#d4d4d4'
      }
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(container);
    fitAddon.fit();
    
    term.fitAddon = fitAddon;
    terminalInstances.set(terminalId, term);
    
    console.log('✅ Terminal instance created and stored');
    
    // Set up input handling - THE CRITICAL PART
    setupTerminalInput(term, terminalId);
    
    // Show initial status
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      term.writeln('\x1b[1;33m● Connecting to terminal server...\x1b[0m');
    } else {
      term.writeln('\x1b[1;33m● WebSocket server not available\x1b[0m');
      term.writeln('\x1b[1;32m● Running in offline mode - type to test\x1b[0m');
      term.write('$ ');
    }
    
  }, 200);
}

/**
 * Sets up terminal input handling
 */
function setupTerminalInput(term, terminalId) {
  console.log('Setting up input handling for terminal:', terminalId);
  
  // For offline mode
  let currentLine = '';
  
  // THE CRITICAL onData HANDLER
  term.onData(data => {
    console.log('🎯 Input received:', data, 'charCode:', data.charCodeAt(0));
    
    // Check if we have an active WebSocket connection
    const session = terminalSessions.get(terminalId);
    const wsConnected = websocket && websocket.readyState === WebSocket.OPEN;
    
    if (wsConnected && session && session.connected) {
      // Send to server via WebSocket
      console.log('📡 Sending to server via WebSocket');
      websocket.send(JSON.stringify({
        type: 'terminal_input',
        sessionId: terminalId,
        input: data
      }));
    } else {
      // Handle locally (offline mode)
      console.log('💻 Handling locally (offline mode)');
      handleLocalInput(term, data, currentLine, (newLine) => {
        currentLine = newLine;
      });
    }
  });
  
  console.log('✅ onData handler set up');
}

/**
 * Handle input locally when WebSocket is not available
 */
function handleLocalInput(term, data, currentLine, setCurrentLine) {
  switch (data) {
    case '\r': // Enter
      term.write('\r\n');
      if (currentLine.trim()) {
        term.writeln(`You typed: "${currentLine}"`);
      }
      setCurrentLine('');
      term.write('$ ');
      break;
      
    case '\u007f': // Backspace
      if (currentLine.length > 0) {
        setCurrentLine(currentLine.slice(0, -1));
        term.write('\b \b');
      }
      break;
      
    case '\u0003': // Ctrl+C
      term.write('^C\r\n');
      setCurrentLine('');
      term.write('$ ');
      break;
      
    default:
      if (data >= ' ') {
        setCurrentLine(currentLine + data);
        term.write(data);
      }
  }
}

/**
 * Fits all terminals to their containers
 */
function fitAllTerminals() {
  terminalInstances.forEach(term => {
    if (term.fitAddon) {
      Meteor.setTimeout(() => {
        term.fitAddon.fit();
      }, 100);
    }
  });
}

/**
 * Handles terminal panel resizing
 */
function startResize(event) {
  event.preventDefault();
  
  const terminal = event.target.closest('.terminal-panel');
  const startY = event.clientY;
  const startHeight = terminal.offsetHeight;
  
  document.body.style.userSelect = 'none';
  
  function onMouseMove(e) {
    const deltaY = startY - e.clientY;
    const newHeight = Math.max(100, Math.min(window.innerHeight * 0.9, startHeight + deltaY));
    
    terminal.style.height = newHeight + 'px';
    
    clearTimeout(terminal._resizeTimeout);
    terminal._resizeTimeout = Meteor.setTimeout(() => {
      fitAllTerminals();
    }, 100);
  }
  
  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.userSelect = '';
    
    fitAllTerminals();
  }
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}