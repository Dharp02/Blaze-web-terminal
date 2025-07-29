# Blaze Terminal

A powerful web-based SSH terminal component for Meteor applications using Blaze templating. Connect to remote servers directly from your web browser with a VS Code-like terminal interface.

##  Features

- **Multi-tab SSH terminals** - Open multiple SSH connections in tabs
- **VS Code-like interface** - Familiar terminal design and keyboard shortcuts
- **Real-time terminal output** - Full xterm.js integration with 256-color support
- **Responsive design** - Works on desktop and mobile devices
- **Connection management** - Easy SSH configuration with error handling
- **Terminal resizing** - Automatic fitting and manual resize support
- **Session persistence** - Maintains connections during browser refresh
- **Keyboard shortcuts** - `Ctrl/Cmd + \`` to toggle terminal

##  Installation

### 1. Add the package to your Meteor project

```bash
# Add the package locally
meteor add blaze-terminal
```

### 2. Install required dependencies

The package uses npm dependencies that will be automatically installed:
- `ws` - WebSocket server for terminal communication
- `ssh2` - SSH client for remote connections
- `xterm` - Terminal emulator (loaded via CDN)

### 3. Add to your application

```html
<!-- In your main template -->
<template name="myApp">
  <div class="app-container">
    <!-- Your app content -->
    
    <!-- Terminal component -->
    {{> terminal}}
  </div>
</template>
```

```javascript
// In your client main.js
import { Template } from 'meteor/templating';
import './main.html';

// Import the terminal package
import 'meteor/blaze-terminal';
```

##  Usage

### Basic Integration

Once installed, the terminal component provides a complete SSH terminal interface:

```html
<template name="dashboard">
  <h1>My Dashboard</h1>
  
  <!-- Terminal will appear at the bottom -->
  {{> terminal}}
</template>
```

### Programmatic Control

```javascript
// Import terminal functions
import { Terminal } from 'meteor/blaze-terminal';

// Toggle terminal visibility
Terminal.toggleVisible();

// Show/hide terminal
Terminal.setVisible(true);
Terminal.setVisible(false);

// Open connection modal
Terminal.showConnectionModal();

// Get terminal state
const terminals = Terminal.getTerminals();
const isVisible = Terminal.isVisible();
const status = Terminal.getConnectionStatus();
```

### Keyboard Shortcuts

- **`Ctrl/Cmd + \``** - Toggle terminal visibility
- **`Ctrl/Cmd + Shift + \``** - Create new terminal
- **Click on terminal** - Focus and enable input
- **Standard terminal shortcuts** - Copy, paste, clear, etc.

##  Configuration

### SSH Connection

When you click "New SSH Connection", you'll be prompted for:

- **Host** - Server hostname or IP address
- **Port** - SSH port (default: 22)
- **Username** - SSH username
- **Password** - SSH password

### Default Configuration

```javascript
// The terminal starts with these defaults
{
  host: 'localhost',
  port: 22,
  username: '',
  password: ''
}
```

### Terminal Settings

The terminal uses these xterm.js settings:

```javascript
{
  cursorBlink: true,
  fontSize: 14,
  fontFamily: 'Monaco, Menlo, "Ubuntu Mono", "Consolas", "Courier New", monospace',
  rows: 30,
  cols: 100,
  theme: {
    background: '#0c0c0c',
    foreground: '#cccccc',
    // ... VS Code dark theme colors
  }
}
```

##  Architecture

### Components

1. **Client Side (`client/`)**
   - `terminal.html` - Blaze template for UI
   - `terminal.css` - Styling and layout
   - `terminal.js` - Terminal logic and WebSocket client
   - `xterm-loader.js` - Loads xterm.js from CDN

2. **Server Side (`server/`)**
   - `main.js` - WebSocket server and SSH connection handler

### Communication Flow

```
Browser ←→ WebSocket ←→ SSH Server ←→ Remote Host
   ↑           ↑              ↑
Terminal    Meteor        SSH Client
 (xterm)    Server        (ssh2)
```

##  Development

### File Structure

```
packages/blaze-terminal/
├── package.js          # Package configuration
├── README.md          # This file
├── client/
│   ├── terminal.html  # Blaze template
│   ├── terminal.css   # Styles
│   ├── terminal.js    # Client logic
│   └── xterm-loader.js # CDN loader
└── server/
    └── main.js        # SSH WebSocket server
```

### Building from Source

```bash
# Clone the repository
git clone <your-repo>
cd blaze-terminal

# Link to your Meteor project
cd your-meteor-project
meteor add ./path/to/blaze-terminal
```

### Debugging

The package includes several debugging utilities:

```javascript
// In browser console
window.focusTerminal(terminalId);
window.testTerminalInput();
window.autoFocus();
window.fixTerminalFocus();

// Check terminal instances
console.log(window.terminalInstances);
console.log(window.terminalSessions);
```

##  Customization

### Styling

Override the default styles by adding CSS:

```css
/* Custom terminal theme */
.terminal-panel {
  background: #1e1e1e;
  border: 1px solid #333;
}

.terminal-tab {
  background: #2d2d30;
  color: #cccccc;
}

.terminal-tab.active {
  background: #1e1e1e;
  border-bottom: 2px solid #0078d4;
}
```

### Terminal Theme

Modify the xterm theme in `terminal.js`:

```javascript
const term = new window.Terminal({
  theme: {
    background: '#1a1a1a',    // Custom background
    foreground: '#ffffff',    // Text color
    cursor: '#ff6600',        // Cursor color
    // ... other theme options
  }
});
```

##  Troubleshooting

### Common Issues

**Terminal not receiving input**
```javascript
// Try focusing the terminal
window.autoFocus();
```

**WebSocket connection failed**
- Check if port 8080 is available
- Ensure firewall allows WebSocket connections
- Verify Meteor server is running

**SSH connection timeout**
- Check SSH server is running on target host
- Verify credentials and network connectivity
- Check firewall settings on remote host

**xterm not loading**
- Check browser console for CDN errors
- Ensure internet connection for CDN access
- Try refreshing the page

### Debug Mode

Enable verbose logging:

```javascript
// In browser console
localStorage.setItem('terminal-debug', 'true');
```

##  Security Notes

- Passwords are transmitted over WebSocket (use HTTPS in production)
- Consider implementing SSH key authentication
- Limit SSH access to trusted networks
- Use strong passwords and proper SSH server configuration


##  Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

##  Dependencies

- **Meteor**: 3.3+
- **Blaze**: Templating engine
- **xterm.js**: Terminal emulator
- **ws**: WebSocket library
- **ssh2**: SSH client library


---

