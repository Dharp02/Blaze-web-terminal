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
const connectionStatus = new ReactiveVar('disconnected');
const savedConnections = new ReactiveVar([]);
const selectedSavedConnection = new ReactiveVar(null);
const showSaveCredentials = new ReactiveVar(false);
const isContainerMode = new ReactiveVar(false);

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

function loadSavedConnections() {
  try {
    const saved = localStorage.getItem('sshConnections');
    const connections = saved ? JSON.parse(saved) : [];
    savedConnections.set(connections);
    return connections;
  } catch (error) {
    console.error('Error loading saved connections:', error);
    return [];
  }
};

function saveConnection(connectionData, name) {
  try {
    const connections = loadSavedConnections();
    const newConnection = {
      id: Random.id(),
      name: name || `${connectionData.username}@${connectionData.host}:${connectionData.port}`,
      host: connectionData.host,
      port: connectionData.port,
      username: connectionData.username,
      // Don't save password for security
      createdAt: new Date().toISOString()
    };
    
    // Check if connection already exists
    const existingIndex = connections.findIndex(conn => 
      conn.host === connectionData.host && 
      conn.port === connectionData.port && 
      conn.username === connectionData.username
    );
    
    if (existingIndex >= 0) {
      connections[existingIndex] = { ...connections[existingIndex], ...newConnection };
    } else {
      connections.push(newConnection);
    }
    
    localStorage.setItem('sshConnections', JSON.stringify(connections));
    savedConnections.set(connections);
    
    console.log(' Connection saved:', newConnection.name);
    return newConnection;
  } catch (error) {
    console.error('Error saving connection:', error);
    throw error;
  }
};

/**
 * Delete saved connection
 */
function deleteSavedConnection(connectionId) {
  try {
    const connections = loadSavedConnections();
    const filtered = connections.filter(conn => conn.id !== connectionId);
    localStorage.setItem('sshConnections', JSON.stringify(filtered));
    savedConnections.set(filtered);
    console.log(' Connection deleted');
  } catch (error) {
    console.error('Error deleting connection:', error);
  }
};

/**
 * Fill form with saved connection data
 */
function fillConnectionForm(connection) {
  const modal = document.querySelector('.connection-modal');
  if (!modal) return;
  
  modal.querySelector('#host').value = connection.host || '';
  modal.querySelector('#port').value = connection.port || 22;
  modal.querySelector('#username').value = connection.username || '';
  modal.querySelector('#password').value = ''; // Always empty for security
  modal.querySelector('#password').focus(); // Focus password field
  
  // Update reactive var
  const config = defaultSSHConfig.get();
  defaultSSHConfig.set({
    ...config,
    host: connection.host,
    port: connection.port,
    username: connection.username,
    password: ''
  });
  
  selectedSavedConnection.set(connection);
  console.log(' Form filled with saved connection:', connection.name);
}

Template.terminal.onCreated(function() {
  console.log('Terminal component created');
  connectWebSocket();
  connectWebSocket();
  loadSavedConnections();
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

   savedConnections() {
    return savedConnections.get();
  },
  
  hasSavedConnections() {
    return savedConnections.get().length > 0;
  },
  
  showSaveCredentials() {
    return showSaveCredentials.get();
  },
  
  selectedSavedConnection() {
    return selectedSavedConnection.get();
  },
  isContainerMode() {
    return isContainerMode.get();
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
  }
});

Template.terminal.events({
  'click .add-terminal'(event) {
    event.preventDefault();
    showConnectionModal.set(true);
    loadSavedConnections();
    showSaveCredentials.set(savedConnections.get().length > 0);
    showConnectionModal.set(true);
  },

  'click .connect-containers-btn'(event) {
    event.preventDefault();
    isContainerMode.set(true);
    
    // TODO: Step 2 - Handle container connection
    console.log('🐳 Connect to Containers clicked');
    handleContainerConnection();
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
  
  // CRITICAL: Click handlers for focusing terminals
  'click .terminal-instance'(event) {
    const terminalId = event.currentTarget.dataset.id;
    focusTerminal(terminalId);
  },
  
  'click .xterm-container'(event) {
    const terminalId = event.currentTarget.closest('.terminal-instance').dataset.id;
    focusTerminal(terminalId);
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

  'click .save-connection-btn'(event) {
    event.preventDefault();
    const form = document.querySelector('.connection-form');
    const formData = new FormData(form);
    
    const connectionData = {
      host: formData.get('host') || 'localhost',
      port: parseInt(formData.get('port')) || 22,
      username: formData.get('username'),
      password: formData.get('password') // Won't be saved, just for validation
    };
    
    if (!connectionData.username) {
      alert('Username is required to save connection');
      return;
    }
    
    try {
      const connectionName = prompt('Enter a name for this connection (optional):');
      const saved = saveConnection(connectionData, connectionName);
      
      // Show success feedback
      const btn = event.currentTarget;
      const originalText = btn.textContent;
      btn.textContent = ' Saved!';
      btn.style.background = '#4caf50';
      
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
      }, 2000);
      
    } catch (error) {
      alert('Failed to save connection: ' + error.message);
    }
  },
  
  // Load saved connection
  'click .saved-connection-item'(event) {
    const connectionId = event.currentTarget.dataset.connectionId;
    const connections = savedConnections.get();
    const connection = connections.find(conn => conn.id === connectionId);
    
    if (connection) {
      fillConnectionForm(connection);
    }
  },
  
  // Delete saved connection
  'click .delete-saved-connection'(event) {
    event.stopPropagation();
    const connectionId = event.currentTarget.dataset.connectionId;
    const connections = savedConnections.get();
    const connection = connections.find(conn => conn.id === connectionId);
    
    if (connection && confirm(`Delete saved connection "${connection.name}"?`)) {
      deleteSavedConnection(connectionId);
    }
  },
  
  // Clear form
  'click .clear-form-btn'(event) {
    event.preventDefault();
    const form = document.querySelector('.connection-form');
    form.reset();
    selectedSavedConnection.set(null);
    
    // Reset reactive var
    defaultSSHConfig.set({
      host: 'localhost',
      port: 22,
      username: '',
      password: ''
    });
    
    document.querySelector('#host').focus();
  },
  
  // Toggle saved connections visibility
  'click .toggle-saved-connections'(event) {
    const isVisible = showSaveCredentials.get();
    showSaveCredentials.set(!isVisible);
  },
  


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
    console.log(' Window resized, fitting terminals...');
    Meteor.setTimeout(fitAllTerminals, 150);
  };
  
  window.addEventListener('resize', handleResize);
  
  // Cleanup
  this.cleanup = () => {
    window.removeEventListener('resize', handleResize);
  };
});

Template.terminal.onDestroyed(function() {
  console.log('Terminal template destroyed');
  
  if (websocket) {
    websocket.close();
    websocket = null;
  }
  
  terminalInstances.forEach((term, terminalId) => {
    console.log(' Disposing terminal:', terminalId);
    term.dispose();
  });
  terminalInstances.clear();
  terminalSessions.clear();
  
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
      console.log(' WebSocket connected');
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
      console.log(` WebSocket closed: ${event.code}`);
      isConnecting = false;
      connectionStatus.set('disconnected');
      
      showWebSocketError('WebSocket disconnected');
      
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
  console.log(' Received:', data.type);
  
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
  
  if (!sshConfig.username) {
    alert('Username is required');
    return;
  }
  
  if (!sshConfig.password) {
    alert('Password is required');
    return;
  }
  
  defaultSSHConfig.set(sshConfig);
  showConnectionModal.set(false);
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

  const terminalNumber = currentTerminals.length + 1;
  
  const newTerminal = {
    id: newId,
    title: `Terminal ${terminalNumber}`,
    isActive: true,
    status: 'connecting'
  };
  
  const updatedTerminals = currentTerminals.map(t => ({
    ...t,
    isActive: false
  }));
  
  terminals.set([...updatedTerminals, newTerminal]);
  activeTerminalId.set(newId);
  
  console.log('Creating terminal with SSH config:', sshConfig);
  websocket.send(JSON.stringify({
    type: 'create_terminal',
    sessionId: newId,
    cols: 100,
    rows: 30,
    sshConfig: sshConfig
  }));
}

/**
 * Handle terminal creation response
 */
function handleTerminalCreated(data) {
  const { sessionId, shell, platform, host } = data;
  console.log(` Terminal created: ${sessionId}`);
  
  const terminalInstance = terminalInstances.get(sessionId);
  if (terminalInstance) {
    // Don't show any status messages - just clear and let SSH output show
    terminalInstance.clear();
    
    terminalSessions.set(sessionId, { connected: true, shell, platform, host });
    
    // Focus the terminal immediately
    Meteor.setTimeout(() => {
      focusTerminal(sessionId);
    }, 100);
  }
  
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
 * FIXED: Focus terminal function
 */
function focusTerminal(terminalId) {
  console.log(' Focusing terminal:', terminalId);
  
  const terminalInstance = terminalInstances.get(terminalId);
  if (terminalInstance) {
    try {
      // Focus the terminal instance
      terminalInstance.focus();
      console.log(' Terminal.focus() called successfully');
      
      // Try to focus the helper textarea specifically
      const container = document.getElementById(`terminal-${terminalId}`);
      if (container) {
        const textarea = container.querySelector('.xterm-helper-textarea');
        if (textarea) {
          textarea.focus();
          console.log(' Helper textarea focused - input should work now');
        } else {
          console.log(' Helper textarea not found');
        }
      }
      
    } catch (error) {
      console.error(' Error focusing terminal:', error);
    }
    
    // Set as active
    setActiveTerminal(terminalId);
    
    console.log(' Terminal focused and should accept input');
  } else {
    console.error(' Terminal instance not found:', terminalId);
  }
}

/**
 * Set active terminal
 */
function setActiveTerminal(terminalId) {
  console.log(' Setting active terminal:', terminalId);
  
  const currentTerminals = terminals.get();
  const updatedTerminals = currentTerminals.map(t => ({
    ...t,
    isActive: t.id === terminalId
  }));
  
  terminals.set(updatedTerminals);
  activeTerminalId.set(terminalId);
  
  // Focus and fit
  Meteor.setTimeout(() => {
    const terminalInstance = terminalInstances.get(terminalId);
    if (terminalInstance) {
      if (terminalInstance.fitAddon) {
        terminalInstance.fitAddon.fit();
      }
      terminalInstance.focus();
    }
  }, 50);
}

/**
 * Close terminal
 */
function closeTerminal(terminalId) {
  const currentTerminals = terminals.get();
  
  if (currentTerminals.length === 1) {
    return;
  }
  
  const filteredTerminals = currentTerminals.filter(t => t.id !== terminalId);
  
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({
      type: 'close_terminal',
      sessionId: terminalId
    }));
  }
  
  const terminalInstance = terminalInstances.get(terminalId);
  if (terminalInstance) {
    terminalInstance.dispose();
    terminalInstances.delete(terminalId);
  }
  
  terminalSessions.delete(terminalId);
  terminals.set(filteredTerminals);
  
  if (activeTerminalId.get() === terminalId && filteredTerminals.length > 0) {
    setActiveTerminal(filteredTerminals[0].id);
  }
}

/**
 * FIXED: Initialize terminal instance with proper input handling
 */
function initializeTerminal(terminalId) {
  console.log(' Initializing terminal:', terminalId);
  
  Meteor.setTimeout(() => {
    const container = document.getElementById(`terminal-${terminalId}`);
    if (!container) {
      console.error(' Container not found:', `terminal-${terminalId}`);
      return;
    }
    
    console.log(' Container found, creating terminal instance');
    
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", "Consolas", "Courier New", monospace',
      lineHeight: 1.2,
      rows: 30,
      cols: 100,
      convertEol: true,
      scrollback: 1000,
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
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(container);
    term.fitAddon = fitAddon;
    
    // Fit after a short delay
    Meteor.setTimeout(() => {
      fitAddon.fit();
      console.log(` Terminal fitted: ${term.cols}x${term.rows}`);
    }, 100);
    
    terminalInstances.set(terminalId, term);
    
    // CRITICAL: Set up input handling IMMEDIATELY
    setupTerminalInput(term, terminalId);
    
    // Add click handlers for focus
    container.addEventListener('click', () => {
      console.log(' Container clicked, focusing terminal');
      focusTerminal(terminalId);
    });
    
    // Focus the terminal
    Meteor.setTimeout(() => {
      term.focus();
      console.log(' Terminal focused and ready');
    }, 200);
    
    // Don't show any initial status messages - keep terminal clean
    
    console.log(' Terminal setup complete');
    
  }, 100);
}

/**
 * CRITICAL: Setup terminal input handling - SIMPLIFIED VERSION
 */
function setupTerminalInput(term, terminalId) {
  console.log(' Setting up input handling for terminal:', terminalId);
  
  // THE MOST IMPORTANT PART: onData handler for input
  term.onData(data => {
    console.log(' INPUT RECEIVED:', JSON.stringify(data), 'for terminal:', terminalId);
    
    const session = terminalSessions.get(terminalId);
    const wsConnected = websocket && websocket.readyState === WebSocket.OPEN;
    
    if (wsConnected && session && session.connected) {
      console.log('📡 Sending input to SSH server');
      websocket.send(JSON.stringify({
        type: 'terminal_input',
        sessionId: terminalId,
        input: data
      }));
    } else {
      console.log(' Terminal not connected - ignoring input');
      // Don't show any messages in terminal - just log to console
    }
  });
  
  console.log(' Input handling setup complete for terminal:', terminalId);
}

/**
 * Fit all terminals
 */
function fitAllTerminals() {
  console.log(' Fitting all terminals...');
  
  terminalInstances.forEach((term, terminalId) => {
    if (term.fitAddon) {
      Meteor.setTimeout(() => {
        const container = document.getElementById(`terminal-${terminalId}`);
        if (container && container.offsetWidth > 0) {
          term.fitAddon.fit();
          console.log(` Fitted terminal ${terminalId}: ${term.cols}x${term.rows}`);
        }
      }, 50);
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
    const deltaY = e.clientY - startY;
    const newHeight = Math.max(200, Math.min(window.innerHeight * 0.9, startHeight - deltaY));
    
    terminal.style.height = newHeight + 'px';
    
    clearTimeout(terminal._resizeTimeout);
    terminal._resizeTimeout = Meteor.setTimeout(fitAllTerminals, 100);
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

// Make functions globally available for debugging
window.focusTerminal = focusTerminal;
window.terminalInstances = terminalInstances;
window.terminalSessions = terminalSessions;

// Debug function to test input manually
window.testTerminalInput = function() {
  const activeId = activeTerminalId.get();
  if (activeId) {
    const term = terminalInstances.get(activeId);
    if (term) {
      console.log('🧪 Testing terminal input...');
      
      // Focus the terminal first
      focusTerminal(activeId);
      
      // Wait a bit, then simulate input
      setTimeout(() => {
        console.log(' Simulating "ls" command...');
        // Trigger the onData handler directly
        if (term.onData) {
          term.onData('ls\r');
        }
      }, 1000);
      
      return true;
    }
  }
  console.log(' No active terminal to test');
  return false;
};

// Auto-focus function - ENHANCED
window.autoFocus = function() {
  const activeId = activeTerminalId.get();
  if (activeId) {
    focusTerminal(activeId);
    
    // Also try to focus the helper textarea directly
    const container = document.getElementById(`terminal-${activeId}`);
    if (container) {
      const textarea = container.querySelector('.xterm-helper-textarea');
      if (textarea) {
        textarea.focus();
        console.log(' Direct focus applied to helper textarea');
        return true;
      }
    }
  }
  console.log(' Could not auto-focus terminal');
  return false;
};

// Quick fix function
window.fixTerminalFocus = function() {
  console.log('🔧 Attempting to fix terminal focus...');
  
  // Try to focus all terminals
  terminalInstances.forEach((term, terminalId) => {
    try {
      term.focus();
      const container = document.getElementById(`terminal-${terminalId}`);
      if (container) {
        const textarea = container.querySelector('.xterm-helper-textarea');
        if (textarea) {
          textarea.focus();
          console.log(` Fixed focus for terminal: ${terminalId}`);
        }
      }
    } catch (error) {
      console.log(` Could not fix terminal: ${terminalId}`);
    }
  });
};