import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Random } from 'meteor/random';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

import './terminal.html';

// ===========================================
// REACTIVE VARIABLES
// ===========================================

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
const activeConnectionTab = new ReactiveVar('containers');

// Default SSH configuration
const defaultSSHConfig = new ReactiveVar({
  host: 'localhost',
  port: 22,
  username: '',
  password: ''
});

// ===========================================
// GLOBAL VARIABLES
// ===========================================

// Terminal instances and WebSocket connections
const terminalInstances = new Map();
const terminalSessions = new Map();

// WebSocket connection
let websocket = null;
let isConnecting = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// ===========================================
// STORAGE FUNCTIONS
// ===========================================

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
}

function saveActiveSessions() {
  const currentTerminals = terminals.get();
  const activeSessions = currentTerminals.map(terminal => ({
    id: terminal.id,
    title: terminal.title,
    status: terminal.status,
    isActive: terminal.isActive,
    savedAt: new Date().toISOString()
  }));
  
  localStorage.setItem('activeTerminalSessions', JSON.stringify(activeSessions));
  console.log('Saved', activeSessions.length, 'active sessions to localStorage');
}

function restoreActiveSessions() {
  try {
    const saved = localStorage.getItem('activeTerminalSessions');
    if (!saved) {
      console.log('No saved sessions found');
      return null;
    }
    
    const sessions = JSON.parse(saved);
    console.log('Found', sessions.length, 'saved sessions, attempting to restore...');
    
    // Set the restored sessions with connecting status
    const restoredSessions = sessions.map(session => ({
      ...session,
      status: 'connecting' // Set to connecting while we check server
    }));
    
    terminals.set(restoredSessions);
    
    // Set active terminal
    const activeSession = sessions.find(s => s.isActive);
    if (activeSession) {
      activeTerminalId.set(activeSession.id);
    } else if (sessions.length > 0) {
      activeTerminalId.set(sessions[0].id);
    }
    
    return sessions;
  } catch (error) {
    console.error('Error restoring sessions:', error);
    localStorage.removeItem('activeTerminalSessions');
    return null;
  }
}

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
    
    console.log('Connection saved:', newConnection.name);
    return newConnection;
  } catch (error) {
    console.error('Error saving connection:', error);
    throw error;
  }
}

function deleteSavedConnection(connectionId) {
  try {
    const connections = loadSavedConnections();
    const filtered = connections.filter(conn => conn.id !== connectionId);
    localStorage.setItem('sshConnections', JSON.stringify(filtered));
    savedConnections.set(filtered);
    console.log('Connection deleted');
  } catch (error) {
    console.error('Error deleting connection:', error);
  }
}

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
  console.log('Form filled with saved connection:', connection.name);
}

// ===========================================
// WEBSOCKET FUNCTIONS
// ===========================================

function connectWebSocket() {
  if (isConnecting || (websocket && websocket.readyState === WebSocket.OPEN)) {
    return;
  }
  
  isConnecting = true;
  console.log('Connecting to WebSocket server...');
  
  try {
    websocket = new WebSocket('ws://localhost:8080');
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
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
      console.log('WebSocket closed:', event.code);
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

function requestSessionReconnection(sessions) {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    console.log('WebSocket not ready, will retry reconnection in 1 second...');
    setTimeout(() => requestSessionReconnection(sessions), 1000);
    return;
  }
  
  console.log('Requesting reconnection to', sessions.length, 'sessions...');
  sessions.forEach(session => {
    console.log('Reconnecting to:', session.title, '(' + session.id + ')');
    websocket.send(JSON.stringify({
      type: 'reconnect_session',
      sessionId: session.id
    }));
  });
}

function showWebSocketError(message) {
  terminalInstances.forEach(term => {
    term.writeln(`\r\n\x1b[1;31m${message}\x1b[0m`);
  });
}

// ===========================================
// MESSAGE HANDLERS
// ===========================================

function handleWebSocketMessage(data) {
  console.log('Received:', data.type, data.sessionId ? `(${data.sessionId.substr(0, 8)})` : '');
  
  switch (data.type) {
    case 'connected':
      console.log('WebSocket server connected');
      break;

    case 'existing_sessions':
      handleExistingSessions(data);
      break;
      
    case 'session_reconnected':
      handleSessionReconnected(data);
      break;
      
    case 'session_not_found':
      handleSessionNotFound(data);
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
      console.log('Terminal closed:', data.sessionId);
      break;
  }
}

function handleSessionReconnected(data) {
  const { sessionId, title, host, username, cols, rows } = data;
  console.log('Session reconnected:', title, '(' + sessionId.substr(0, 8) + ')');
  
  // Update terminal status and title
  const currentTerminals = terminals.get();
  const updatedTerminals = currentTerminals.map(terminal => 
    terminal.id === sessionId 
      ? { ...terminal, status: 'connected', title: title || terminal.title }
      : terminal
  );
  terminals.set(updatedTerminals);
  
  // Initialize the terminal UI for this session if not already done
  if (!terminalInstances.has(sessionId)) {
    console.log('Initializing terminal UI for reconnected session');
    Meteor.setTimeout(() => {
      initializeTerminal(sessionId, true); //  Pass isReconnection = true
    }, 100);
  }
  
  // Mark session as connected
  terminalSessions.set(sessionId, { 
    connected: true, 
    host: host,
    username: username,
    reconnected: true 
  });
  
  // Save the updated session state
  saveActiveSessions();
}

function handleSessionNotFound(data) {
  const { sessionId } = data;
  console.log('Session not found on server:', sessionId.substr(0, 8));
  
  // Remove this terminal from our list
  const currentTerminals = terminals.get();
  const filteredTerminals = currentTerminals.filter(t => t.id !== sessionId);
  terminals.set(filteredTerminals);
  
  // Clean up local state
  terminalInstances.delete(sessionId);
  terminalSessions.delete(sessionId);
  
  // Update active terminal if needed
  if (activeTerminalId.get() === sessionId && filteredTerminals.length > 0) {
    setActiveTerminal(filteredTerminals[0].id);
  }
  
  // Save updated sessions
  saveActiveSessions();
}

function handleTerminalCreated(data) {
  const { sessionId, shell, platform, host } = data;
  console.log('Terminal created:', sessionId.substr(0, 8));
  
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
  // Save sessions after successful creation
  saveActiveSessions();
}

function handleTerminalOutput(data) {
  const { sessionId, data: output } = data;
  const terminalInstance = terminalInstances.get(sessionId);
  
  if (terminalInstance) {
    terminalInstance.write(output);
  }
}

function handleTerminalExit(data) {
  const { sessionId, exitCode } = data;
  const terminalInstance = terminalInstances.get(sessionId);
  
  if (terminalInstance) {
    terminalInstance.writeln(`\r\n\x1b[1;31mProcess exited with code ${exitCode}\x1b[0m`);
    terminalInstance.writeln('\x1b[1;33mConnection closed\x1b[0m');
  }
  
  terminalSessions.delete(sessionId);
  updateTerminalStatus(sessionId, 'disconnected');
}

function handleTerminalError(data) {
  const { sessionId, error } = data;
  const terminalInstance = terminalInstances.get(sessionId);
  
  if (terminalInstance) {
    terminalInstance.writeln(`\r\n\x1b[1;31mError: ${error}\x1b[0m`);
    terminalInstance.writeln('\x1b[1;33mCheck your connection details and try again\x1b[0m');
  }
  
  console.error(`Terminal error: ${error}`);
  updateTerminalStatus(sessionId, 'error');
}

// ===========================================
// TERMINAL CREATION FUNCTIONS
// ===========================================

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
  
  const updatedTerminals = currentTerminals.map(t => ({
    ...t,
    isActive: false
  }));
  
  terminals.set([...updatedTerminals, newTerminal]);
  activeTerminalId.set(newId);
  
  console.log('Creating terminal with SSH config:', `${sshConfig.username}@${sshConfig.host}:${sshConfig.port}`);
  websocket.send(JSON.stringify({
    type: 'create_terminal',
    sessionId: newId,
    cols: 100,
    rows: 30,
    sshConfig: sshConfig
  }));
  
  // Save sessions immediately (will be updated when connection succeeds)
  saveActiveSessions();
}

// ===========================================
// TERMINAL INSTANCE FUNCTIONS
// ===========================================

function initializeTerminal(terminalId, isReconnection = false) {
  console.log('Initializing terminal:', terminalId, isReconnection ? '(reconnection)' : '(new)');
  
  Meteor.setTimeout(() => {
    const container = document.getElementById(`terminal-${terminalId}`);
    if (!container) {
      console.error('Container not found:', `terminal-${terminalId}`);
      return;
    }
    
    console.log('Container found, creating terminal instance');
    
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

    if (!isReconnection) {
      term.reset();
      term.clear();
      console.log('Terminal cleared (new connection)');
    } else {
      console.log('Terminal NOT cleared (reconnection - preserving content)');
    }
    
    // Fit after a short delay
    Meteor.setTimeout(() => {
      fitAddon.fit();
      console.log('Terminal fitted:', term.cols + 'x' + term.rows);
    }, 100);
    
    terminalInstances.set(terminalId, term);
    
    // CRITICAL: Set up input handling IMMEDIATELY
    setupTerminalInput(term, terminalId);
    monitorScrollAreaHeight(terminalId);
    // Add click handlers for focus
    container.addEventListener('click', () => {
      console.log('Container clicked, focusing terminal');
      focusTerminal(terminalId);
    });
    
    // Focus the terminal
    Meteor.setTimeout(() => {
      term.focus();
      console.log('Terminal focused and ready');
    }, 200);
    
    console.log('Terminal setup complete');
    
  }, 100);
}

function setupTerminalInput(term, terminalId) {
  console.log('Setting up input handling for terminal:', terminalId);
  
  // THE MOST IMPORTANT PART: onData handler for input
  term.onData(data => {
    console.log('INPUT RECEIVED:', JSON.stringify(data), 'for terminal:', terminalId);
    
    const session = terminalSessions.get(terminalId);
    const wsConnected = websocket && websocket.readyState === WebSocket.OPEN;
    
    if (wsConnected && session && session.connected) {
      console.log('Sending input to SSH server');
      websocket.send(JSON.stringify({
        type: 'terminal_input',
        sessionId: terminalId,
        input: data
      }));
    } else {
      console.log('Terminal not connected - ignoring input');
    }
  });
  
  console.log('Input handling setup complete for terminal:', terminalId);
}

function monitorScrollAreaHeight(terminalId) {
  const container = document.getElementById(`terminal-${terminalId}`);
  if (!container) return;

  setTimeout(() => {
    const scrollArea = container.querySelector('.xterm-scroll-area');
    const terminalContent = container.closest('.terminal-content');
    
    if (!scrollArea || !terminalContent) return;
    
    // Setup
    scrollArea.style.height = '0px';
    terminalContent.style.overflowY = 'scroll';
    
    // Scroll to bottom by default immediately
    terminalContent.scrollTop = terminalContent.scrollHeight;
    
    // Watch for height changes and reset
    new MutationObserver(() => {
      if (scrollArea.style.height !== '0px') {
        scrollArea.style.height = '0px';
        terminalContent.scrollTop = terminalContent.scrollHeight;
      }
    }).observe(scrollArea, { attributes: true, attributeFilter: ['style'] });
    
    // Auto-scroll on new content
    const rows = container.querySelector('.xterm-rows');
    if (rows) {
      new MutationObserver(() => {
        terminalContent.scrollTop = terminalContent.scrollHeight;
      }).observe(rows, { childList: true, subtree: true });
    }
    
    console.log(` Monitoring active for terminal: ${terminalId} - scrolled to bottom`);
  }, 500);
}

// ===========================================
// TERMINAL MANAGEMENT FUNCTIONS
// ===========================================

function focusTerminal(terminalId) {
  console.log('Focusing terminal:', terminalId);
  
  const terminalInstance = terminalInstances.get(terminalId);
  if (terminalInstance) {
    try {
      // Focus the terminal instance
      terminalInstance.focus();
      console.log('Terminal.focus() called successfully');
      
      // Try to focus the helper textarea specifically
      const container = document.getElementById(`terminal-${terminalId}`);
      if (container) {
        const textarea = container.querySelector('.xterm-helper-textarea');
        if (textarea) {
          textarea.focus();
          console.log('Helper textarea focused - input should work now');
        } else {
          console.log('Helper textarea not found');
        }
      }
      
    } catch (error) {
      console.error('Error focusing terminal:', error);
    }
    
    // Set as active
    setActiveTerminal(terminalId);
    
    console.log('Terminal focused and should accept input');
  } else {
    console.error('Terminal instance not found:', terminalId);
  }
}

function setActiveTerminal(terminalId) {
  console.log('Setting active terminal:', terminalId);
  
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

function closeTerminal(terminalId) {
  const currentTerminals = terminals.get();
  
  if (currentTerminals.length === 1) {
    // If it's the last terminal, clear saved sessions
    localStorage.removeItem('activeTerminalSessions');
    console.log('Cleared saved sessions (last terminal closed)');
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
  
  // Save sessions after closing
  if (filteredTerminals.length > 0) {
    saveActiveSessions();
  }
}

function updateTerminalStatus(terminalId, status) {
  const currentTerminals = terminals.get();
  const updatedTerminals = currentTerminals.map(t => 
    t.id === terminalId ? { ...t, status } : t
  );
  terminals.set(updatedTerminals);
}

function fitAllTerminals() {
  console.log('Fitting all terminals...');
  
  terminalInstances.forEach((term, terminalId) => {
    if (term.fitAddon) {
      Meteor.setTimeout(() => {
        const container = document.getElementById(`terminal-${terminalId}`);
        if (container && container.offsetWidth > 0) {
          term.fitAddon.fit();
          console.log('Fitted terminal', terminalId + ':', term.cols + 'x' + term.rows);
        }
      }, 50);
    }
  });
}

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

// ===========================================
// TEMPLATE HELPERS
// ===========================================

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
  },

  isContainerTab() {
    return activeConnectionTab.get() === 'containers';
  },
  
  isSSHTab() {
    return activeConnectionTab.get() === 'ssh';
  },
  
  isSavedTab() {
    return activeConnectionTab.get() === 'saved';
  }
});

// ===========================================
// TEMPLATE EVENTS
// ===========================================

Template.terminal.events({
  'click .add-terminal'(event) {
    event.preventDefault();
    showConnectionModal.set(true);
    loadSavedConnections();
    showSaveCredentials.set(savedConnections.get().length > 0);
  },

  'click .connect-containers-btn'(event) {
    event.preventDefault();
    isContainerMode.set(true);
    console.log('Connect to Containers clicked');
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
      btn.textContent = 'Saved!';
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
      
      // Switch to SSH tab after filling form
      activeConnectionTab.set('ssh');
      document.querySelectorAll('.connection-tab').forEach(tab => {
        tab.classList.remove('active');
      });
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
      });
      document.querySelector('[data-tab="ssh"]').classList.add('active');
      document.querySelector('.ssh-pane').classList.add('active');
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

  'click .connection-tab'(event) {
    const tabName = event.currentTarget.dataset.tab;
    activeConnectionTab.set(tabName);
    
    // Update visual state
    document.querySelectorAll('.connection-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.remove('active');
    });
    
    event.currentTarget.classList.add('active');
    document.querySelector(`.${tabName}-pane`).classList.add('active');
  },

  'click .reset-mode-btn'(event) {
    event.preventDefault();
    isContainerMode.set(false);
  }
});

// ===========================================
// TEMPLATE LIFECYCLE
// ===========================================

Template.terminal.onCreated(function() {
  console.log('Terminal component created');
  
  // First, try to restore saved sessions
  const restoredSessions = restoreActiveSessions();
  
  // Connect to WebSocket
  connectWebSocket();
  loadSavedConnections();
  
  // If we have restored sessions, try to reconnect after WebSocket is ready
  if (restoredSessions && restoredSessions.length > 0) {
    console.log('Will attempt to reconnect to', restoredSessions.length, 'saved sessions');
    
    // Wait for WebSocket to be ready, then request reconnections
    const checkWebSocket = () => {
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        console.log('WebSocket ready, requesting reconnections...');
        requestSessionReconnection(restoredSessions);
      } else {
        setTimeout(checkWebSocket, 500);
      }
    };
    
    // Start checking after a brief delay
    setTimeout(checkWebSocket, 100);
  } else {
    console.log('No saved sessions to restore');
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
    console.log('Window resized, fitting terminals...');
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
    console.log('Disposing terminal:', terminalId);
    term.dispose();
  });
  terminalInstances.clear();
  terminalSessions.clear();
  
  if (this.cleanup) {
    this.cleanup();
  }
});

// ===========================================
// DEBUG AND UTILITY FUNCTIONS
// ===========================================

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
      console.log('Testing terminal input...');
      
      // Focus the terminal first
      focusTerminal(activeId);
      
      // Wait a bit, then simulate input
      setTimeout(() => {
        console.log('Simulating "ls" command...');
        // Trigger the onData handler directly
        if (term.onData) {
          term.onData('ls\r');
        }
      }, 1000);
      
      return true;
    }
  }
  console.log('No active terminal to test');
  return false;
};

// Auto-focus function
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
        console.log('Direct focus applied to helper textarea');
        return true;
      }
    }
  }
  console.log('Could not auto-focus terminal');
  return false;
};

// Quick fix function
window.fixTerminalFocus = function() {
  console.log('Attempting to fix terminal focus...');
  
  // Try to focus all terminals
  terminalInstances.forEach((term, terminalId) => {
    try {
      term.focus();
      const container = document.getElementById(`terminal-${terminalId}`);
      if (container) {
        const textarea = container.querySelector('.xterm-helper-textarea');
        if (textarea) {
          textarea.focus();
          console.log('Fixed focus for terminal:', terminalId);
        }
      }
    } catch (error) {
      console.log('Could not fix terminal:', terminalId);
    }
  });
};

// Manual clear function for debugging
window.clearSavedSessions = function() {
  localStorage.removeItem('activeTerminalSessions');
  console.log('Manually cleared all saved terminal sessions');
};

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Public API for other packages to integrate with terminal
 */
window.TerminalAPI = {
  
  /**
   * Check if terminal package is available
   */
  isAvailable() {
    return true;
  },
  
  /**
   * Create direct SSH connection
   * @param {Object} sshConfig - SSH connection configuration
   * @param {string} sshConfig.host - Host address
   * @param {number} sshConfig.port - SSH port
   * @param {string} sshConfig.username - Username
   * @param {string} sshConfig.password - Password
   */
  createDirectConnection(sshConfig) {
    console.log('Direct connection requested:', `${sshConfig.username}@${sshConfig.host}:${sshConfig.port}`);
    
    // Validate config
    if (!sshConfig.host || !sshConfig.username || !sshConfig.password) {
      console.error('Invalid SSH config for direct connection');
      return false;
    }
    
    // Show terminal panel if hidden
    isTerminalVisible.set(true);
    
    // Create terminal with SSH config 
    createTerminalWithSSH(sshConfig);
    
    console.log('Direct connection initiated');
    return true;
  },
  
  /**
   * Show terminal panel
   */
  showTerminal() {
    isTerminalVisible.set(true);
  },
  
  /**
   * Get terminal status
   */
  getStatus() {
    return {
      visible: isTerminalVisible.get(),
      terminalCount: terminals.get().length,
      connected: connectionStatus.get() === 'connected'
    };
  }
};

console.log('Terminal API ready for integration');