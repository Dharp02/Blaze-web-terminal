// imports/ui/terminal.js - Simple version with basic keys only
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

// Terminal instances storage
const terminalInstances = new Map();

Template.terminal.onCreated(function() {
  // Initialize with one terminal
  this.autorun(() => {
    if (terminals.get().length === 0) {
      addNewTerminal();
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
  this.autorun(() => {
    const terminalList = terminals.get();
    terminalList.forEach(term => {
      if (!terminalInstances.has(term.id)) {
        initializeTerminal(term.id);
      }
    });
  });
  
  window.addEventListener('resize', fitAllTerminals);
});

/**
 * Creates a new terminal
 */
function addNewTerminal() {
  const newId = Random.id();
  const currentTerminals = terminals.get();
  
  const newTerminal = {
    id: newId,
    title: `Terminal ${currentTerminals.length + 1}`,
    isActive: true
  };
  
  const updatedTerminals = currentTerminals.map(t => ({
    ...t,
    isActive: false
  }));
  
  terminals.set([...updatedTerminals, newTerminal]);
  activeTerminalId.set(newId);
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
  
  // Dispose of the terminal instance
  const terminalInstance = terminalInstances.get(terminalId);
  if (terminalInstance) {
    terminalInstance.dispose();
    terminalInstances.delete(terminalId);
  }
  
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
  Meteor.setTimeout(() => {
    const container = document.getElementById(`terminal-${terminalId}`);
    if (!container) return;
    
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
    
    setupBasicTerminal(term, terminalId);
    
  }, 100);
}

/**
 * Sets up terminal with all key handlers but no command execution
 */
function setupBasicTerminal(term, terminalId) {
  // Simple welcome message
  term.writeln('Terminal Ready - All keys supported');
  term.writeln('');
  
  let currentLine = '';
  let isInCommand = false;
  const commandHistory = [];
  let historyIndex = -1;
  
  // Simple prompt
  term.write('$ ');
  
  // Handle all keys as requested
  term.onData(data => {
    if (isInCommand) return;
    
    switch (data) {
      case '\r': // Enter
        handleEnterKey();
        break;
      case '\u007f': // Backspace
        handleBackspace();
        break;
      case '\u001b[A': // Up arrow
        handleUpArrow();
        break;
      case '\u001b[B': // Down arrow
        handleDownArrow();
        break;
      case '\u001b[C': // Right arrow
        // TODO: Implement cursor movement
        break;
      case '\u001b[D': // Left arrow
        // TODO: Implement cursor movement
        break;
      case '\u0003': // Ctrl+C
        handleCtrlC();
        break;
      case '\u0009': // Tab
        handleTab();
        break;
      default:
        if (data >= ' ') {
          currentLine += data;
          term.write(data);
        }
    }
  });
  
  function handleEnterKey() {
    term.write('\r\n');
    
    // Add to history if not empty
    if (currentLine.trim()) {
      commandHistory.unshift(currentLine.trim());
      if (commandHistory.length > 100) {
        commandHistory.pop();
      }
      // Just echo what was typed, no command execution
      term.writeln(`You entered: "${currentLine}"`);
    }
    
    // Reset for next line
    currentLine = '';
    historyIndex = -1;
    term.write('$ ');
  }
  
  function handleBackspace() {
    if (currentLine.length > 0) {
      currentLine = currentLine.slice(0, -1);
      term.write('\b \b');
    }
  }
  
  function handleUpArrow() {
    if (historyIndex < commandHistory.length - 1) {
      historyIndex++;
      replaceCurrentLine(commandHistory[historyIndex]);
    }
  }
  
  function handleDownArrow() {
    if (historyIndex > 0) {
      historyIndex--;
      replaceCurrentLine(commandHistory[historyIndex]);
    } else if (historyIndex === 0) {
      historyIndex = -1;
      replaceCurrentLine('');
    }
  }
  
  function handleCtrlC() {
    term.write('^C\r\n');
    currentLine = '';
    historyIndex = -1;
    term.write('$ ');
  }
  
  function handleTab() {
    // Simple tab - just add 4 spaces or do nothing
    currentLine += '    ';
    term.write('    ');
  }
  
  function replaceCurrentLine(newLine) {
    // Clear current line
    term.write('\r' + ' '.repeat(2 + currentLine.length) + '\r');
    term.write('$ ' + newLine);
    currentLine = newLine;
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