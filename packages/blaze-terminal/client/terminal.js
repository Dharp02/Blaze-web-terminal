import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Random } from 'meteor/random';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

import './terminal.html';
import './terminal.css';

// ===========================================
// REACTIVE VARIABLES
// ===========================================

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

const defaultSSHConfig = new ReactiveVar({
  host: 'localhost',
  port: 22,
  username: '',
  password: ''
});

// ===========================================
// GLOBAL VARIABLES
// ===========================================

const terminalInstances = new Map();
const terminalSessions = new Map();

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
    console.error('❌ Error loading saved connections:', error);
    return [];
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
      createdAt: new Date().toISOString()
    };
    
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
    
    console.log('💾 Connection saved:', newConnection.name);
    return newConnection;
  } catch (error) {
    console.error('❌ Error saving connection:', error);
    throw error;
  }
}

function deleteSavedConnection(connectionId) {
  try {
    const connections = loadSavedConnections();
    const filtered = connections.filter(conn => conn.id !== connectionId);
    localStorage.setItem('sshConnections', JSON.stringify(filtered));
    savedConnections.set(filtered);
    console.log('🗑️ Connection deleted');
  } catch (error) {
    console.error('❌ Error deleting connection:', error);
  }
}

function fillConnectionForm(connection) {
  const modal = document.querySelector('.connection-modal');
  if (!modal) return;
  
  modal.querySelector('#host').value = connection.host || '';
  modal.querySelector('#port').value = connection.port || 22;
  modal.querySelector('#username').value = connection.username || '';
  modal.querySelector('#password').value = '';
  modal.querySelector('#password').focus();
  
  const config = defaultSSHConfig.get();
  defaultSSHConfig.set({
    ...config,
    host: connection.host,
    port: connection.port,
    username: connection.username,
    password: ''
  });
  
  selectedSavedConnection.set(connection);
  console.log('📝 Form filled with saved connection:', connection.name);
}

// ===========================================
// WEBSOCKET FUNCTIONS
// ===========================================

function connectWebSocket(containerName = null, containerId = null, method = 'docker') {
  if (isConnecting || (websocket && websocket.readyState === WebSocket.OPEN)) {
    return;
  }
  
  isConnecting = true;
  
  // Build WebSocket URL with path-based routing
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const port = window.location.port || (protocol === 'wss:' ? '443' : '80');
  let wsUrl = `${protocol}//${host}:${port}`;
  
  if (containerName) {
    wsUrl += `/socket/name/${encodeURIComponent(containerName)}?method=${method}`;
  } else if (containerId) {
    wsUrl += `/socket/id/${encodeURIComponent(containerId)}?method=${method}`;
  } else {
    console.error('❌ Container name or ID required');
    isConnecting = false;
    return;
  }
  
  console.log('🔌 Connecting to:', wsUrl);
  
  try {
    websocket = new WebSocket(wsUrl);
    
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
        console.error('❌ Error parsing message:', error);
      }
    };
    
    websocket.onclose = (event) => {
      console.log('🔌 WebSocket closed:', event.code);
      isConnecting = false;
      connectionStatus.set('disconnected');
      
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(`🔄 Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
        setTimeout(() => connectWebSocket(containerName, containerId, method), 2000 * reconnectAttempts);
      }
    };
    
    websocket.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      isConnecting = false;
      connectionStatus.set('disconnected');
    };
    
  } catch (error) {
    console.error('❌ Error creating WebSocket:', error);
    isConnecting = false;
    connectionStatus.set('disconnected');
  }
}

// ===========================================
// MESSAGE HANDLERS
// ===========================================

function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'connected':
      console.log('✅ Server confirmed connection');
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
      console.log('🔚 Terminal closed:', data.sessionId);
      break;
      
    default:
      console.log('⚠️ Unknown message type:', data.type);
  }
}

function handleExistingSessions(data) {
  const { sessions } = data;
  console.log('📋 Received', sessions.length, 'existing sessions');
  
  if (!sessions || sessions.length === 0) return;
  
  const restoredSessions = sessions.map(session => ({
    id: session.sessionId,
    title: session.title,
    status: 'connecting',
    isActive: false
  }));
  
  terminals.set(restoredSessions);
  
  if (restoredSessions.length > 0) {
    activeTerminalId.set(restoredSessions[0].id);
  }
  
  // Request reconnection to each session
  sessions.forEach(session => {
    console.log('🔄 Reconnecting to:', session.title);
    websocket.send(JSON.stringify({
      type: 'reconnect_session',
      sessionId: session.sessionId
    }));
  });
}

function handleSessionReconnected(data) {
  const { sessionId, title } = data;
  console.log('✅ Session reconnected:', title);
  
  const currentTerminals = terminals.get();
  const updatedTerminals = currentTerminals.map(terminal => 
    terminal.id === sessionId 
      ? { ...terminal, status: 'connected', title: title || terminal.title }
      : terminal
  );
  terminals.set(updatedTerminals);
  
  if (!terminalInstances.has(sessionId)) {
    console.log('🖥️  Initializing terminal UI for reconnected session');
    Meteor.setTimeout(() => {
      initializeTerminal(sessionId, true);
    }, 100);
  }
  
  terminalSessions.set(sessionId, { 
    connected: true, 
    host: data.host,
    username: data.username,
    reconnected: true 
  });
}

function handleSessionNotFound(data) {
  const { sessionId } = data;
  console.log('❌ Session not found:', sessionId.substr(0, 8));
  
  const currentTerminals = terminals.get();
  const filteredTerminals = currentTerminals.filter(t => t.id !== sessionId);
  terminals.set(filteredTerminals);
  
  terminalInstances.delete(sessionId);
  terminalSessions.delete(sessionId);
  
  if (activeTerminalId.get() === sessionId && filteredTerminals.length > 0) {
    setActiveTerminal(filteredTerminals[0].id);
  }
}

function handleTerminalCreated(data) {
  const { sessionId } = data;
  console.log('✅ Terminal created:', sessionId.substr(0, 8));
  
  if (!terminalInstances.has(sessionId)) {
    console.log('🖥️  Initializing terminal UI');
    Meteor.setTimeout(() => {
      initializeTerminal(sessionId, false);
      
      const terminalInstance = terminalInstances.get(sessionId);
      if (terminalInstance) {
        terminalInstance.clear();
        terminalSessions.set(sessionId, { 
          connected: true, 
          shell: data.shell, 
          platform: data.platform, 
          host: data.host 
        });
        
        Meteor.setTimeout(() => {
          focusTerminal(sessionId);
        }, 100);
      }
    }, 100);
  } else {
    const terminalInstance = terminalInstances.get(sessionId);
    terminalInstance.clear();
    
    terminalSessions.set(sessionId, { 
      connected: true, 
      shell: data.shell, 
      platform: data.platform, 
      host: data.host 
    });
    
    Meteor.setTimeout(() => {
      focusTerminal(sessionId);
    }, 100);
  }
  
  updateTerminalStatus(sessionId, 'connected');
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
    terminalInstance.writeln(`\r\n\x1b[1;31m❌ Process exited with code ${exitCode}\x1b[0m`);
    terminalInstance.writeln('\x1b[1;33m🔌 Connection closed\x1b[0m');
  }
  
  terminalSessions.delete(sessionId);
  updateTerminalStatus(sessionId, 'disconnected');
}

function handleTerminalError(data) {
  const { sessionId, error } = data;
  const terminalInstance = terminalInstances.get(sessionId);
  
  if (terminalInstance) {
    terminalInstance.writeln(`\r\n\x1b[1;31m❌ Error: ${error}\x1b[0m`);
  }
  
  console.error('❌ Terminal error:', error);
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
    alert('⚠️ Username is required');
    return;
  }
  
  if (!sshConfig.password) {
    alert('⚠️ Password is required');
    return;
  }
  
  defaultSSHConfig.set(sshConfig);
  showConnectionModal.set(false);
  
  // TODO: This needs to be updated for path-based routing
  // Currently SSH tab won't work without container context
  console.warn('⚠️ Direct SSH connections need container context in new architecture');
  alert('⚠️ Direct SSH connections require container context. Please use container management.');
}

// ===========================================
// TERMINAL INSTANCE FUNCTIONS
// ===========================================

function initializeTerminal(terminalId, isReconnection = false) {
  console.log('🖥️  Initializing terminal:', terminalId, isReconnection ? '(reconnection)' : '(new)');
  
  Meteor.setTimeout(() => {
    const container = document.getElementById(`terminal-${terminalId}`);
    if (!container) {
      console.error('❌ Container not found:', `terminal-${terminalId}`);
      return;
    }
    
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
    }
    
    Meteor.setTimeout(() => {
      fitAddon.fit();
    }, 100);
    
    terminalInstances.set(terminalId, term);
    
    setupTerminalInput(term, terminalId);
    monitorScrollAreaHeight(terminalId);
    
    container.addEventListener('click', () => {
      focusTerminal(terminalId);
    });
    
    Meteor.setTimeout(() => {
      term.focus();
    }, 200);
    
  }, 100);
}

function setupTerminalInput(term, terminalId) {
  term.onData(data => {
    const session = terminalSessions.get(terminalId);
    const wsConnected = websocket && websocket.readyState === WebSocket.OPEN;
    
    if (wsConnected && session && session.connected) {
      websocket.send(JSON.stringify({
        type: 'terminal_input',
        sessionId: terminalId,
        input: data
      }));
    }
  });
}

function monitorScrollAreaHeight(terminalId) {
  const container = document.getElementById(`terminal-${terminalId}`);
  if (!container) return;

  setTimeout(() => {
    const scrollArea = container.querySelector('.xterm-scroll-area');
    const terminalContent = container.closest('.terminal-content');
    
    if (!scrollArea || !terminalContent) return;
    
    scrollArea.style.height = '0px';
    terminalContent.style.overflowY = 'scroll';
    terminalContent.scrollTop = terminalContent.scrollHeight;
    
    new MutationObserver(() => {
      if (scrollArea.style.height !== '0px') {
        scrollArea.style.height = '0px';
        terminalContent.scrollTop = terminalContent.scrollHeight;
      }
    }).observe(scrollArea, { attributes: true, attributeFilter: ['style'] });
    
    const rows = container.querySelector('.xterm-rows');
    if (rows) {
      new MutationObserver(() => {
        terminalContent.scrollTop = terminalContent.scrollHeight;
      }).observe(rows, { childList: true, subtree: true });
    }
  }, 500);
}

// ===========================================
// TERMINAL MANAGEMENT FUNCTIONS
// ===========================================

function focusTerminal(terminalId) {
  const terminalInstance = terminalInstances.get(terminalId);
  if (terminalInstance) {
    try {
      terminalInstance.focus();
      
      const container = document.getElementById(`terminal-${terminalId}`);
      if (container) {
        const textarea = container.querySelector('.xterm-helper-textarea');
        if (textarea) {
          textarea.focus();
        }
      }
    } catch (error) {
      console.error('❌ Error focusing terminal:', error);
    }
    
    setActiveTerminal(terminalId);
  }
}

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
      if (terminalInstance.fitAddon) {
        terminalInstance.fitAddon.fit();
      }
      terminalInstance.focus();
    }
  }, 50);
}

function closeTerminal(terminalId) {
  const currentTerminals = terminals.get();
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

function updateTerminalStatus(terminalId, status) {
  const currentTerminals = terminals.get();
  const updatedTerminals = currentTerminals.map(t => 
    t.id === terminalId ? { ...t, status } : t
  );
  terminals.set(updatedTerminals);
}

function fitAllTerminals() {
  terminalInstances.forEach((term, terminalId) => {
    if (term.fitAddon) {
      Meteor.setTimeout(() => {
        const container = document.getElementById(`terminal-${terminalId}`);
        if (container && container.offsetWidth > 0) {
          term.fitAddon.fit();
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
    
    Meteor.call('createContainer', (error, result) => {
      if (!error && result.success) {
        console.log('✅ Container created');
        showConnectionModal.set(false);
        
        // Use new API for container connection
        window.TerminalAPI.createContainerConnection({
          containerName: result.containerName,
          method: 'ssh',
          sshConfig: {
            host: 'localhost',
            port: parseInt(result.sshPort),
            username: 'root',
            password: 'changeme'
          }
        });
      }
    });
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
  
  'click .terminal-instance'(event) {
    const terminalId = event.currentTarget.dataset.id;
    focusTerminal(terminalId);
  },
  
  'click .xterm-container'(event) {
    const terminalId = event.currentTarget.closest('.terminal-instance').dataset.id;
    focusTerminal(terminalId);
  },
  
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
      password: formData.get('password')
    };
    
    if (!connectionData.username) {
      alert('⚠️ Username is required to save connection');
      return;
    }
    
    try {
      const connectionName = prompt('Enter a name for this connection (optional):');
      saveConnection(connectionData, connectionName);
      
      const btn = event.currentTarget;
      const originalText = btn.textContent;
      btn.textContent = '✅ Saved!';
      btn.style.background = '#4caf50';
      
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
      }, 2000);
      
    } catch (error) {
      alert('❌ Failed to save connection: ' + error.message);
    }
  },
  
  'click .saved-connection-item'(event) {
    const connectionId = event.currentTarget.dataset.connectionId;
    const connections = savedConnections.get();
    const connection = connections.find(conn => conn.id === connectionId);
    
    if (connection) {
      fillConnectionForm(connection);
      
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
  
  'click .delete-saved-connection'(event) {
    event.stopPropagation();
    const connectionId = event.currentTarget.dataset.connectionId;
    const connections = savedConnections.get();
    const connection = connections.find(conn => conn.id === connectionId);
    
    if (connection && confirm(`Delete saved connection "${connection.name}"?`)) {
      deleteSavedConnection(connectionId);
    }
  },
  
  'click .clear-form-btn'(event) {
    event.preventDefault();
    const form = document.querySelector('.connection-form');
    form.reset();
    selectedSavedConnection.set(null);
    
    defaultSSHConfig.set({
      host: 'localhost',
      port: 22,
      username: '',
      password: ''
    });
    
    document.querySelector('#host').focus();
  },
  
  'click .toggle-saved-connections'(event) {
    const isVisible = showSaveCredentials.get();
    showSaveCredentials.set(!isVisible);
  },

  'click .connection-tab'(event) {
    const tabName = event.currentTarget.dataset.tab;
    activeConnectionTab.set(tabName);
    
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
  console.log('🚀 Terminal component created');
  
  loadSavedConnections();
  
  // Note: WebSocket connection is now initiated by container management
  // when user selects a container to connect to
});

Template.terminal.onRendered(function() {
  console.log('🖥️  Terminal template rendered');
  
  this.autorun(() => {
    const terminalList = terminals.get();
    terminalList.forEach(term => {
      if (!terminalInstances.has(term.id)) {
        initializeTerminal(term.id);
      }
    });
  });
  
  const handleResize = () => {
    Meteor.setTimeout(fitAllTerminals, 150);
  };
  
  window.addEventListener('resize', handleResize);
  
  this.cleanup = () => {
    window.removeEventListener('resize', handleResize);
  };
});

Template.terminal.onDestroyed(function() {
  console.log('🛑 Terminal template destroyed');
  
  if (websocket) {
    websocket.close();
    websocket = null;
  }
  
  terminalInstances.forEach((term, terminalId) => {
    term.dispose();
  });
  terminalInstances.clear();
  terminalSessions.clear();
  
  if (this.cleanup) {
    this.cleanup();
  }
});

// ===========================================
// PUBLIC API
// ===========================================

window.TerminalAPI = {
  isAvailable() {
    return true;
  },
  
  createDirectConnection(sshConfig) {
    console.warn('⚠️ Direct SSH connections require container context in new architecture');
    alert('⚠️ Direct SSH connections not supported. Please use container management.');
    return false;
  },

  createContainerConnection(options) {
    const { containerName, containerId, method = 'docker', sshConfig } = options;
    
    if (!containerName && !containerId) {
      console.error('❌ Container name or ID required');
      return false;
    }

    if (method === 'ssh' && (!sshConfig || !sshConfig.username || !sshConfig.password)) {
      console.error('❌ SSH config required for SSH method');
      return false;
    }
    
    isTerminalVisible.set(true);
    
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.close();
      websocket = null;
    }
    
    connectWebSocket(containerName, containerId, method);
    
    const checkConnection = setInterval(() => {
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        clearInterval(checkConnection);
        
        const newId = Random.id();
        const currentTerminals = terminals.get();
        
        const title = method === 'docker' 
          ? `docker:${containerName || containerId.substring(0, 12)}`
          : `${sshConfig.username}@${containerName || containerId.substring(0, 12)}`;
        
        const newTerminal = {
          id: newId,
          title: title,
          isActive: true,
          status: 'connecting'
        };
        
        const updatedTerminals = currentTerminals.map(t => ({
          ...t,
          isActive: false
        }));
        
        terminals.set([...updatedTerminals, newTerminal]);
        activeTerminalId.set(newId);
        
        const message = {
          type: 'create_terminal',
          sessionId: newId,
          cols: 100,
          rows: 30
        };
        
        if (method === 'ssh') {
          message.sshConfig = sshConfig;
        }
        
        websocket.send(JSON.stringify(message));
      }
    }, 100);
    
    setTimeout(() => {
      clearInterval(checkConnection);
    }, 5000);
    
    return true;
  },
  
  showTerminal() {
    isTerminalVisible.set(true);
  },
  
  getStatus() {
    return {
      visible: isTerminalVisible.get(),
      terminalCount: terminals.get().length,
      connected: connectionStatus.get() === 'connected'
    };
  }
};

console.log('✅ Terminal API ready');