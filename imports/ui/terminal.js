// imports/ui/terminal.js - Enhanced version with SSH connection form
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
const showConnectionModal = new ReactiveVar(false);
const connectionStatus = new ReactiveVar('disconnected'); // disconnected, connecting, connected

// Terminal instances and WebSocket connections
const terminalInstances = new Map();
const terminalSessions = new Map();

// WebSocket connection
let websocket = null;
let isConnecting = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Default SSH configuration
const defaultSSHConfig = new ReactiveVar({
  host: 'localhost',
  port: 22,
  username: '',
  password: ''
});

Template.terminal.onCreated(function() {
  console.log('Terminal component created');
  
  // Connect to WebSocket server
  connectWebSocket();
});

Template.terminal.helpers({
  isTerminalVisible() {
    return isTerminalVisible.get();
  },
  
  showConnectionModal() {
    return showConnectionModal.get();
  },
  
  connectionStatus() {
    return connectionStatus.get();
  },
  
  isConnected() {
    return connectionStatus.get() === 'connected';
  },
  
  isConnecting() {
    return connectionStatus.get() === 'connecting';
  },
  
  isDisconnected() {
    return connectionStatus.get() === 'disconnected';
  },
  
  terminals() {
    return terminals.get().map(term => ({
      ...term,
      isActive: term.id === activeTerminalId.get(),
      isTerminalConnecting: term.status === 'connecting'
    }));
  },
  
  sshConfig() {
    return defaultSSHConfig.get();
  },
  
  // Helper to check terminal status
  isTerminalStatus(status) {
    return function(terminalStatus) {
      return terminalStatus === status;
    };
  }
});

Template.terminal.events({
  // Terminal events
  'click .add-terminal'(event) {
    event.preventDefault();
    showConnectionModal.set(true);
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
  },
  
  // Terminal instance click handling
  'click .terminal-instance'(event) {
    const terminalId = event.currentTarget.dataset.id;
    const terminalInstance = terminalInstances.get(terminalId);
    if (terminalInstance) {
      console.log('🎯 Terminal clicked, focusing:', terminalId);
      terminalInstance.focus();
    }
  },
  
  'click .xterm-container'(event) {
    const terminalId = event.currentTarget.closest('.terminal-instance').dataset.id;
    const terminalInstance = terminalInstances.get(terminalId);
    if (terminalInstance) {
      console.log('🎯 XTerm container clicked, focusing:', terminalId);
      terminalInstance.focus();
    }
  },
  
  // Connection modal events
  'click .connection-modal-overlay'(event) {
    if (event.target === event.currentTarget) {
      showConnectionModal.set(false);
    }
  },
  
  'click .modal-close'() {
    showConnectionModal.set(false);
  },
  
  'submit .connection-form'(event) {
    event.preventDefault();
    handleConnectionSubmit(event);
  },
  
  'input .ssh-input'(event) {
    const field = event.target.name;
    const value = event.target.value;
    const config = defaultSSHConfig.get();
    config[field] = field === 'port' ? parseInt(value) || 22 : value;
    defaultSSHConfig.set(config);
  },
  
  'click .quick-connect'(event) {
    const config = event.currentTarget.dataset;
    defaultSSHConfig.set({
      host: config.host,
      port: parseInt(config.port) || 22,
      username: config.username,
      password: ''
    });
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
  
  // Handle window resize
  const handleResize = () => {
    console.log('🔄 Window resized, fitting terminals...');
    Meteor.setTimeout(() => {
      fitAllTerminals();
    }, 150);
  };
  
  window.addEventListener('resize', handleResize);
  
  // Handle terminal visibility changes
  this.autorun(() => {
    const visible = isTerminalVisible.get();
    const activeId = activeTerminalId.get();
    
    if (visible && activeId) {
      // When terminal becomes visible, focus the active terminal
      Meteor.setTimeout(() => {
        const activeTerminal = terminalInstances.get(activeId);
        if (activeTerminal) {
          console.log('🎯 Terminal panel visible, focusing active terminal:', activeId);
          activeTerminal.focus();
          if (activeTerminal.fitAddon) {
            activeTerminal.fitAddon.fit();
          }
        }
      }, 300);
    }
  });
  
  // Cleanup on destroy
  this.autorun((computation) => {
    if (computation.invalidated) return;
    
    // Store cleanup function
    this.cleanup = () => {
      window.removeEventListener('resize', handleResize);
    };
  });
});

Template.terminal.onDestroyed(function() {
  console.log('Terminal template destroyed');
  
  // Close WebSocket connection
  if (websocket) {
    websocket.close();
    websocket = null;
  }
  
  // Clean up all terminal instances
  terminalInstances.forEach((term, terminalId) => {
    console.log('🧹 Disposing terminal:', terminalId);
    term.dispose();
  });
  terminalInstances.clear();
  terminalSessions.clear();
  
  // Call cleanup function if it exists
  if (this.cleanup) {
    this.cleanup();
  }
});

/**
 * Connect to WebSocket server
 */
function connectWebSocket() {
  if (isConnecting || (websocket && websocket.readyState === WebSocket.OPEN)) {
    return;
  }
  
  isConnecting = true;
  console.log('Connecting to WebSocket server...');
  
  try {
    websocket = new WebSocket('ws://localhost:8080');
    
    websocket.onopen = () => {
      console.log('✅ WebSocket connected');
      isConnecting = false;
      reconnectAttempts = 0;
      connectionStatus.set('connected');
    };
    
    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    websocket.onclose = (event) => {
      console.log(`❌ WebSocket closed: ${event.code}`);
      isConnecting = false;
      connectionStatus.set('disconnected');
      
      // Update terminals
      showWebSocketError('WebSocket disconnected');
      
      // Reconnect attempt
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(`Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
        setTimeout(connectWebSocket, 2000 * reconnectAttempts);
      }
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      isConnecting = false;
      connectionStatus.set('disconnected');
    };
    
  } catch (error) {
    console.error('Error creating WebSocket:', error);
    isConnecting = false;
    connectionStatus.set('disconnected');
  }
}

/**
 * Handle WebSocket messages
 */
function handleWebSocketMessage(data) {
  console.log('📨 Received:', data.type);
  
  switch (data.type) {
    case 'connected':
      console.log('Server connected');
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
      console.log(`Terminal closed: ${data.sessionId}`);
      break;
  }
}

/**
 * Handle connection form submission
 */
function handleConnectionSubmit(event) {
  const formData = new FormData(event.target);
  const sshConfig = {
    host: formData.get('host') || 'localhost',
    port: parseInt(formData.get('port')) || 22,
    username: formData.get('username'),
    password: formData.get('password')
  };
  
  // Validate required fields
  if (!sshConfig.username) {
    alert('Username is required');
    return;
  }
  
  if (!sshConfig.password) {
    alert('Password is required');
    return;
  }
  
  // Update default config
  defaultSSHConfig.set(sshConfig);
  
  // Close modal
  showConnectionModal.set(false);
  
  // Create terminal with SSH config
  createTerminalWithSSH(sshConfig);
}

/**
 * Create terminal with SSH configuration
 */
function createTerminalWithSSH(sshConfig) {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    alert('WebSocket not connected. Please wait and try again.');
    return;
  }
  
  const newId = Random.id();
  const currentTerminals = terminals.get();
  
  const newTerminal = {
    id: newId,
    title: `${sshConfig.username}@${sshConfig.host}:${sshConfig.port}`,
    isActive: true,
    status: 'connecting'
  };
  
  // Set other terminals as inactive
  const updatedTerminals = currentTerminals.map(t => ({
    ...t,
    isActive: false
  }));
  
  terminals.set([...updatedTerminals, newTerminal]);
  activeTerminalId.set(newId);
  
  // Send create terminal request with SSH config
  console.log('Creating terminal with SSH config:', sshConfig);
  websocket.send(JSON.stringify({
    type: 'create_terminal',
    sessionId: newId,
    cols: 80,
    rows: 24,
    sshConfig: sshConfig
  }));
}

/**
 * Handle terminal creation response
 */
function handleTerminalCreated(data) {
  const { sessionId, shell, platform, host } = data;
  console.log(`✅ Terminal created: ${sessionId}`);
  
  const terminalInstance = terminalInstances.get(sessionId);
  if (terminalInstance) {
    terminalInstance.clear();
    terminalInstance.writeln(`\x1b[1;32m● Connected to ${host}\x1b[0m`);
    terminalInstance.writeln(`\x1b[1;32m● Shell: ${shell} on ${platform}\x1b[0m`);
    terminalInstance.writeln(`\x1b[1;32m● Terminal ready for input\x1b[0m`);
    terminalInstance.writeln('');
    
    // Mark session as connected
    terminalSessions.set(sessionId, { connected: true, shell, platform, host });
    
    // Focus the terminal for immediate input
    Meteor.setTimeout(() => {
      terminalInstance.focus();
      console.log('🎯 Terminal focused and ready for input');
      
      // Fit the terminal
      if (terminalInstance.fitAddon) {
        terminalInstance.fitAddon.fit();
        console.log(`📐 Terminal fitted: ${terminalInstance.cols}x${terminalInstance.rows}`);
      }
    }, 200);
  }
  
  // Update terminal status
  updateTerminalStatus(sessionId, 'connected');
}

/**
 * Handle terminal output
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
    terminalInstance.writeln('\x1b[1;33m● Connection closed\x1b[0m');
  }
  
  terminalSessions.delete(sessionId);
  updateTerminalStatus(sessionId, 'disconnected');
}

/**
 * Handle terminal errors
 */
function handleTerminalError(data) {
  const { sessionId, error } = data;
  const terminalInstance = terminalInstances.get(sessionId);
  
  if (terminalInstance) {
    terminalInstance.writeln(`\r\n\x1b[1;31m● Error: ${error}\x1b[0m`);
    terminalInstance.writeln('\x1b[1;33m● Check your connection details and try again\x1b[0m');
  }
  
  console.error(`Terminal error: ${error}`);
  updateTerminalStatus(sessionId, 'error');
}

/**
 * Update terminal status
 */
function updateTerminalStatus(terminalId, status) {
  const currentTerminals = terminals.get();
  const updatedTerminals = currentTerminals.map(t => 
    t.id === terminalId ? { ...t, status } : t
  );
  terminals.set(updatedTerminals);
}

/**
 * Show WebSocket error
 */
function showWebSocketError(message) {
  terminalInstances.forEach(term => {
    term.writeln(`\r\n\x1b[1;31m● ${message}\x1b[0m`);
  });
}

/**
 * Set active terminal
 */
function setActiveTerminal(terminalId) {
  const currentTerminals = terminals.get();
  const updatedTerminals = currentTerminals.map(t => ({
    ...t,
    isActive: t.id === terminalId
  }));
  
  terminals.set(updatedTerminals);
  activeTerminalId.set(terminalId);
  
  Meteor.setTimeout(() => {
    const terminalInstance = terminalInstances.get(terminalId);
    if (terminalInstance) {
      terminalInstance.focus();
    }
  }, 100);
}

/**
 * Close terminal
 */
function closeTerminal(terminalId) {
  const currentTerminals = terminals.get();
  
  if (currentTerminals.length === 1) {
    return; // Don't close last terminal
  }
  
  const filteredTerminals = currentTerminals.filter(t => t.id !== terminalId);
  
  // Close server session
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({
      type: 'close_terminal',
      sessionId: terminalId
    }));
  }
  
  // Cleanup terminal instance
  const terminalInstance = terminalInstances.get(terminalId);
  if (terminalInstance) {
    terminalInstance.dispose();
    terminalInstances.delete(terminalId);
  }
  
  terminalSessions.delete(terminalId);
  terminals.set(filteredTerminals);
  
  // Set new active terminal
  if (activeTerminalId.get() === terminalId && filteredTerminals.length > 0) {
    setActiveTerminal(filteredTerminals[0].id);
  }
}

/**
 * Initialize terminal instance
 */
function initializeTerminal(terminalId) {
  console.log('Initializing terminal:', terminalId);
  
  Meteor.setTimeout(() => {
    const container = document.getElementById(`terminal-${terminalId}`);
    if (!container) {
      console.error('Container not found:', `terminal-${terminalId}`);
      return;
    }
    
    console.log('✅ Container found, creating terminal instance');
    
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", "Consolas", "Courier New", monospace',
      lineHeight: 1.2,
      letterSpacing: 0,
      rows: 30,
      cols: 100,
      allowTransparency: false,
      convertEol: true,
      scrollback: 1000,
      tabStopWidth: 8,
      theme: {
        background: '#0c0c0c',
        foreground: '#cccccc',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selection: 'rgba(255, 255, 255, 0.3)',
        black: '#0c0c0c',
        red: '#c50f1f',
        green: '#13a10e',
        yellow: '#c19c00',
        blue: '#0037da',
        magenta: '#881798',
        cyan: '#3a96dd',
        white: '#cccccc',
        brightBlack: '#767676',
        brightRed: '#e74856',
        brightGreen: '#16c60c',
        brightYellow: '#f9f1a5',
        brightBlue: '#3b78ff',
        brightMagenta: '#b4009e',
        brightCyan: '#61d6d6',
        brightWhite: '#f2f2f2'
      }
    });
    
    // Load and configure fit addon
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    // Open terminal in container
    term.open(container);
    
    // Initial fit
    Meteor.setTimeout(() => {
      fitAddon.fit();
      console.log(`📐 Terminal fitted: ${term.cols}x${term.rows}`);
    }, 50);
    
    // Store fit addon reference
    term.fitAddon = fitAddon;
    terminalInstances.set(terminalId, term);
    
    // Set up input handling IMMEDIATELY
    setupTerminalInput(term, terminalId);
    
    // Focus the terminal to enable input
    term.focus();
    
    // Show initial status
    term.writeln('\x1b[1;33m● Terminal initialized and ready for input\x1b[0m');
    term.writeln('\x1b[1;33m● Waiting for SSH connection...\x1b[0m');
    
    console.log('✅ Terminal setup complete');
    
  }, 100);
}

/**
 * Setup terminal input handling
 */
function setupTerminalInput(term, terminalId) {
  console.log('🎯 Setting up input handling for terminal:', terminalId);
  
  // Critical: Set up the onData handler for input
  term.onData(data => {
    console.log('📝 Terminal input received:', JSON.stringify(data));
    
    const session = terminalSessions.get(terminalId);
    const wsConnected = websocket && websocket.readyState === WebSocket.OPEN;
    
    if (wsConnected && session && session.connected) {
      // Send input to SSH server
      console.log('📡 Sending input to SSH server');
      websocket.send(JSON.stringify({
        type: 'terminal_input',
        sessionId: terminalId,
        input: data
      }));
    } else {
      // Show offline message
      console.log('❌ Terminal not connected, input ignored');
      term.writeln('\r\n\x1b[1;31m● Not connected to SSH server\x1b[0m');
    }
  });
  
  // Handle terminal focus
  term.onFocus(() => {
    console.log('🎯 Terminal focused:', terminalId);
  });
  
  term.onBlur(() => {
    console.log('😴 Terminal blurred:', terminalId);
  });
  
  // Auto-focus when clicked
  term.element.addEventListener('click', () => {
    term.focus();
  });
  
  console.log('✅ Input handling setup complete');
}

/**
 * Fit all terminals
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
 * Handle terminal resize
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