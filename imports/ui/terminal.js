// imports/ui/terminal.js - Version without node-pty
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Random } from 'meteor/random';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

import './terminal.html';

// Reactive variables for terminal state
const isTerminalVisible = new ReactiveVar(true);
const terminals = new ReactiveVar([]);
const activeTerminalId = new ReactiveVar(null);

// Terminal instances storage
const terminalInstances = new Map();

// Simulated file system for demo
const fileSystem = {
  '/': ['home', 'var', 'usr', 'etc'],
  '/home': ['user'],
  '/home/user': ['Documents', 'Downloads', 'Desktop', 'projects'],
  '/home/user/projects': ['meteor-app', 'react-app', 'node-server'],
  '/home/user/Documents': ['readme.txt', 'notes.md']
};

let currentDirectory = '/home/user';

Template.terminal.onCreated(function() {
  // Initialize with one terminal when template is created
  this.autorun(() => {
    if (terminals.get().length === 0) {
      addNewTerminal();
    }
  });
  
  // Listen for global keyboard shortcuts
  document.addEventListener('terminal-toggle', () => {
    isTerminalVisible.set(!isTerminalVisible.get());
  });
  
  document.addEventListener('terminal-new', () => {
    addNewTerminal();
  });
  
  document.addEventListener('terminal-fit-all', () => {
    fitAllTerminals();
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
  
  'click #minimize-terminal'() {
    const panel = document.querySelector('.terminal-panel');
    if (panel) {
      panel.style.height = '35px';
    }
  },
  
  'click #maximize-terminal'() {
    const panel = document.querySelector('.terminal-panel');
    if (panel) {
      panel.style.height = '80vh';
      fitAllTerminals();
    }
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
  
  window.addEventListener('resize', () => {
    fitAllTerminals();
  });
});

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

function closeTerminal(terminalId) {
  const currentTerminals = terminals.get();
  
  if (currentTerminals.length === 1) {
    return;
  }
  
  const filteredTerminals = currentTerminals.filter(t => t.id !== terminalId);
  
  const terminalInstance = terminalInstances.get(terminalId);
  if (terminalInstance) {
    terminalInstance.dispose();
    terminalInstances.delete(terminalId);
  }
  
  terminals.set(filteredTerminals);
  
  if (activeTerminalId.get() === terminalId && filteredTerminals.length > 0) {
    setActiveTerminal(filteredTerminals[0].id);
  }
}

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
    
    setupAdvancedTerminal(term, terminalId);
    
  }, 100);
}

function setupAdvancedTerminal(term, terminalId) {
  // Enhanced terminal with more realistic features
  term.writeln('\x1b[1;34m╭─ Terminal App v1.0\x1b[0m');
  term.writeln('\x1b[1;34m├─ Meteor + Blaze + Xterm.js\x1b[0m');
  term.writeln('\x1b[1;34m╰─ Type "help" for available commands\x1b[0m');
  term.writeln('');
  
  let currentLine = '';
  let isInCommand = false;
  
  // Enhanced command history
  const commandHistory = [];
  let historyIndex = -1;
  
  // Auto-completion data
  const commands = ['help', 'clear', 'ls', 'cd', 'pwd', 'mkdir', 'touch', 'cat', 'echo', 'date', 'whoami', 'ps', 'top', 'git', 'npm', 'node', 'meteor'];
  
  function getPrompt() {
    const user = 'user';
    const hostname = 'terminal-app';
    const dir = currentDirectory === '/home/user' ? '~' : currentDirectory.replace('/home/user', '~');
    return `\x1b[1;32m${user}@${hostname}\x1b[0m:\x1b[1;34m${dir}\x1b[0m$ `;
  }
  
  term.write(getPrompt());
  
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
    
    if (currentLine.trim()) {
      commandHistory.unshift(currentLine.trim());
      if (commandHistory.length > 100) {
        commandHistory.pop();
      }
      executeAdvancedCommand(currentLine.trim());
    }
    
    currentLine = '';
    historyIndex = -1;
    term.write(getPrompt());
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
    term.write(getPrompt());
  }
  
  function handleTab() {
    if (currentLine.trim()) {
      const matches = commands.filter(cmd => cmd.startsWith(currentLine.trim()));
      if (matches.length === 1) {
        const completion = matches[0].substring(currentLine.length);
        currentLine += completion;
        term.write(completion);
      } else if (matches.length > 1) {
        term.write('\r\n');
        term.writeln(matches.join('  '));
        term.write(getPrompt() + currentLine);
      }
    }
  }
  
  function replaceCurrentLine(newLine) {
    // Clear current line
    term.write('\r' + ' '.repeat(getPrompt().replace(/\x1b\[[0-9;]*m/g, '').length + currentLine.length) + '\r');
    term.write(getPrompt() + newLine);
    currentLine = newLine;
  }
  
  async function executeAdvancedCommand(command) {
    isInCommand = true;
    const [cmd, ...args] = command.split(' ');
    
    try {
      switch (cmd.toLowerCase()) {
        case 'help':
          showHelp();
          break;
          
        case 'clear':
          term.clear();
          break;
          
        case 'ls':
          listDirectory(args[0]);
          break;
          
        case 'cd':
          changeDirectory(args[0]);
          break;
          
        case 'pwd':
          term.writeln(currentDirectory);
          break;
          
        case 'mkdir':
          makeDirectory(args[0]);
          break;
          
        case 'touch':
          createFile(args[0]);
          break;
          
        case 'cat':
          showFile(args[0]);
          break;
          
        case 'echo':
          term.writeln(args.join(' '));
          break;
          
        case 'date':
          term.writeln(new Date().toString());
          break;
          
        case 'whoami':
          term.writeln('user');
          break;
          
        case 'ps':
          showProcesses();
          break;
          
        case 'git':
          handleGitCommand(args);
          break;
          
        case 'npm':
          handleNpmCommand(args);
          break;
          
        case 'meteor':
          handleMeteorCommand(args);
          break;
          
        case 'node':
          if (args[0] === '-v' || args[0] === '--version') {
            term.writeln('v22.16.0');
          } else {
            term.writeln('Node.js REPL not available in demo mode');
          }
          break;
          
        default:
          term.writeln(`bash: ${cmd}: command not found`);
      }
    } catch (error) {
      term.writeln(`Error: ${error.message}`);
    }
    
    isInCommand = false;
  }
  
  function showHelp() {
    term.writeln('Available commands:');
    term.writeln('  \x1b[1;33mhelp\x1b[0m       - Show this help');
    term.writeln('  \x1b[1;33mclear\x1b[0m      - Clear terminal');
    term.writeln('  \x1b[1;33mls\x1b[0m [path]  - List directory contents');
    term.writeln('  \x1b[1;33mcd\x1b[0m <path>  - Change directory');
    term.writeln('  \x1b[1;33mpwd\x1b[0m        - Print working directory');
    term.writeln('  \x1b[1;33mmkdir\x1b[0m <dir> - Create directory');
    term.writeln('  \x1b[1;33mtouch\x1b[0m <file> - Create file');
    term.writeln('  \x1b[1;33mcat\x1b[0m <file> - Show file contents');
    term.writeln('  \x1b[1;33mecho\x1b[0m <text> - Echo text');
    term.writeln('  \x1b[1;33mdate\x1b[0m       - Show current date');
    term.writeln('  \x1b[1;33mwhoami\x1b[0m     - Show current user');
    term.writeln('  \x1b[1;33mps\x1b[0m         - Show processes');
    term.writeln('  \x1b[1;33mgit\x1b[0m <cmd>  - Git commands');
    term.writeln('  \x1b[1;33mnpm\x1b[0m <cmd>  - NPM commands');
    term.writeln('  \x1b[1;33mmeteor\x1b[0m <cmd> - Meteor commands');
    term.writeln('');
    term.writeln('Keyboard shortcuts:');
    term.writeln('  \x1b[1;36mCtrl+C\x1b[0m     - Interrupt command');
    term.writeln('  \x1b[1;36mTab\x1b[0m        - Auto-complete');
    term.writeln('  \x1b[1;36m↑/↓\x1b[0m        - Command history');
  }
  
  function listDirectory(path) {
    const targetPath = path ? resolvePath(path) : currentDirectory;
    const contents = fileSystem[targetPath];
    
    if (contents) {
      contents.forEach(item => {
        const isDir = fileSystem[`${targetPath}/${item}`];
        if (isDir) {
          term.writeln(`\x1b[1;34m${item}/\x1b[0m`);
        } else {
          term.writeln(item);
        }
      });
    } else {
      term.writeln(`ls: cannot access '${targetPath}': No such file or directory`);
    }
  }
  
  function changeDirectory(path) {
    if (!path || path === '~') {
      currentDirectory = '/home/user';
      return;
    }
    
    const targetPath = resolvePath(path);
    if (fileSystem[targetPath]) {
      currentDirectory = targetPath;
    } else {
      term.writeln(`cd: no such file or directory: ${path}`);
    }
  }
  
  function resolvePath(path) {
    if (path.startsWith('/')) {
      return path;
    } else if (path === '..') {
      const parts = currentDirectory.split('/');
      parts.pop();
      return parts.join('/') || '/';
    } else if (path === '.') {
      return currentDirectory;
    } else {
      return `${currentDirectory}/${path}`.replace('//', '/');
    }
  }
  
  function makeDirectory(dirname) {
    if (dirname) {
      term.writeln(`Created directory: ${dirname}`);
    } else {
      term.writeln('mkdir: missing operand');
    }
  }
  
  function createFile(filename) {
    if (filename) {
      term.writeln(`Created file: ${filename}`);
    } else {
      term.writeln('touch: missing operand');
    }
  }
  
  function showFile(filename) {
    if (filename) {
      if (filename === 'readme.txt') {
        term.writeln('# Terminal App');
        term.writeln('This is a demo terminal built with Meteor and Xterm.js');
        term.writeln('It simulates basic shell commands.');
      } else if (filename === 'notes.md') {
        term.writeln('# Development Notes');
        term.writeln('- Terminal UI matches VS Code style');
        term.writeln('- Built with reactive Blaze templates');
        term.writeln('- Uses Xterm.js for terminal emulation');
      } else {
        term.writeln(`cat: ${filename}: No such file or directory`);
      }
    } else {
      term.writeln('cat: missing operand');
    }
  }
  
  function showProcesses() {
    term.writeln('PID   CMD');
    term.writeln('1     /sbin/init');
    term.writeln('123   meteor');
    term.writeln('456   node (mongod)');
    term.writeln('789   terminal-app');
  }
  
  function handleGitCommand(args) {
    const subcommand = args[0];
    switch (subcommand) {
      case 'status':
        term.writeln('On branch main');
        term.writeln('nothing to commit, working tree clean');
        break;
      case 'log':
        term.writeln('commit abc123 (HEAD -> main)');
        term.writeln('Author: Developer <dev@example.com>');
        term.writeln('Date: ' + new Date().toDateString());
        term.writeln('    Added terminal functionality');
        break;
      case '--version':
        term.writeln('git version 2.40.0');
        break;
      default:
        term.writeln(`git: '${subcommand}' is not a git command. See 'git --help'.`);
    }
  }
  
  function handleNpmCommand(args) {
    const subcommand = args[0];
    switch (subcommand) {
      case '--version':
      case '-v':
        term.writeln('10.8.1');
        break;
      case 'list':
      case 'ls':
        term.writeln('terminal-app@1.0.0');
        term.writeln('├── meteor@3.3.0');
        term.writeln('├── xterm@5.3.0');
        term.writeln('└── xterm-addon-fit@0.8.0');
        break;
      case 'start':
        term.writeln('> meteor run');
        term.writeln('Starting Meteor app...');
        break;
      default:
        term.writeln(`Usage: npm <command>`);
    }
  }
  
  function handleMeteorCommand(args) {
    const subcommand = args[0];
    switch (subcommand) {
      case '--version':
        term.writeln('Meteor 3.3.0');
        break;
      case 'run':
        term.writeln('[[[[[ ~/terminal-app ]]]]]');
        term.writeln('=> Started proxy.');
        term.writeln('=> Started HMR server.');
        term.writeln('=> Started MongoDB.');
        term.writeln('=> Started your app.');
        term.writeln('=> App running at: http://localhost:3000/');
        break;
      case 'list':
        term.writeln('blaze-html-templates');
        term.writeln('reactive-var');
        term.writeln('session');
        break;
      default:
        term.writeln('Usage: meteor <command>');
    }
  }
}

function fitAllTerminals() {
  terminalInstances.forEach(term => {
    if (term.fitAddon) {
      Meteor.setTimeout(() => {
        term.fitAddon.fit();
      }, 100);
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