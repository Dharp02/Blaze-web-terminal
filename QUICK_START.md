# Quick Start Guide: Using Path-Based WebSocket Routing

## For End Users

### Connecting to a Container

1. **Via UI (Recommended)**
   - Open the application
   - Go to Container Management
   - Click "Connect" on any running container
   - Choose connection method:
     - **OK** = Docker Exec (instant, no password)
     - **Cancel** = SSH (requires password)

2. **Via Browser Console (Docker Exec)**
```javascript
window.TerminalAPI.createContainerConnection({
  containerName: 'my-container',
  method: 'docker'
});
```

3. **Via Browser Console (SSH)**
```javascript
window.TerminalAPI.createContainerConnection({
  containerName: 'my-container',
  method: 'ssh',
  sshConfig: {
    host: 'localhost',
    port: 32774,
    username: 'root',
    password: 'changeme'
  }
});
```

## For Developers

### Key Code Examples

#### Connect by Container Name (Docker Exec)
```javascript
window.TerminalAPI.createContainerConnection({
  containerName: 'ssh-container-12345',
  method: 'docker'
});
```

#### Connect by Container ID (Docker Exec)
```javascript
window.TerminalAPI.createContainerConnection({
  containerId: 'abc123def456',
  method: 'docker'
});
```

#### Connect with SSH
```javascript
window.TerminalAPI.createContainerConnection({
  containerName: 'my-container',
  method: 'ssh',
  sshConfig: {
    host: 'localhost',
    port: 22,
    username: 'root',
    password: 'secret'
  }
});
```

### WebSocket URL Examples

Your browser will automatically connect to these paths:

```
Docker Exec by name:
ws://localhost:3002/socket/name/my-container?method=docker

Docker Exec by ID:
ws://localhost:3002/socket/id/abc123def456?method=docker

SSH by name:
ws://localhost:3002/socket/name/my-container?method=ssh

SSH by ID:
ws://localhost:3002/socket/id/abc123def456?method=ssh

Legacy (backwards compatible):
ws://localhost:3002
```

## Testing the Implementation

### 1. Start the Application
```bash
cd /Volumes/Case/prj/Blaze-web-terminal
meteor run --settings settings.json
```

### 2. Create a Test Container
```bash
# Simple Alpine container (for Docker exec)
docker run -d --name test-docker-exec alpine sleep 3600

# SSH-enabled container (for SSH method)
docker run -d --name test-ssh -p 0:22 your-ssh-image
```

### 3. Test Docker Exec
Open browser console:
```javascript
// Should connect instantly
window.TerminalAPI.createContainerConnection({
  containerName: 'test-docker-exec',
  method: 'docker'
});

// Terminal should appear with bash prompt
// Try commands: ls, pwd, echo "Hello"
```

### 4. Test SSH
```javascript
// Get the SSH port
// docker port test-ssh 22
// Returns: 0.0.0.0:32774

window.TerminalAPI.createContainerConnection({
  containerName: 'test-ssh',
  method: 'ssh',
  sshConfig: {
    host: 'localhost',
    port: 32774,  // Use actual port from above
    username: 'root',
    password: 'changeme'
  }
});
```

### 5. Test via UI
1. Open Container Management tab
2. You should see your containers listed
3. Click "Connect" button
4. Choose "Docker Exec" (OK) or "SSH" (Cancel)
5. Terminal should open automatically

## Troubleshooting

### ❌ Error: "Container not found"
```bash
# Check container name
docker ps -a --format "{{.Names}}"

# Make sure name matches exactly
```

### ❌ Error: "Container not running"
```bash
# Start the container
docker start <container-name>
```

### ❌ Docker Exec: Command not found
```bash
# Some containers don't have /bin/bash
# The code defaults to /bin/bash
# For Alpine: it uses /bin/sh (but bash links to sh)
# If issues persist, check container:
docker exec -it <container-name> ls -la /bin/
```

### ❌ SSH: Authentication failed
- Double-check username/password
- Verify SSH server is running in container
- Check container logs: `docker logs <container-name>`

### ❌ TypeScript Errors in VSCode
These are expected and won't affect runtime:
- WebSocket custom properties
- window.TerminalAPI
- Map iteration

They're type checking errors, not actual code errors.

## Verifying It Works

### Success Indicators

✅ **Docker Exec Working:**
```
1. Click Connect → Choose Docker Exec
2. Terminal opens in <100ms
3. See bash prompt: root@containerid:/# 
4. Can type commands
5. Commands execute and show output
```

✅ **SSH Working:**
```
1. Click Connect → Choose SSH
2. Terminal opens in ~1 second
3. See SSH login banner
4. See bash prompt
5. Can type commands
6. Commands execute and show output
```

✅ **Server Logs Should Show:**
```
WebSocket upgrade request: /socket/name/test-docker-exec { method: 'docker' }
Upgrading connection for container: test-docker-exec method: docker
Client connected: a1b2c3 → test-docker-exec (docker)
Creating Docker exec terminal: xyz123 for container: test-docker-exec
Docker exec terminal created: xyz123
```

## Common Use Cases

### Use Case 1: Quick Debug Container
```javascript
// Spin up debug container
docker run -d --name debug alpine sleep 3600

// Connect instantly
window.TerminalAPI.createContainerConnection({
  containerName: 'debug',
  method: 'docker'
});

// Debug something
// When done: docker rm -f debug
```

### Use Case 2: Connect to Existing Service
```javascript
// Connect to running service container
window.TerminalAPI.createContainerConnection({
  containerName: 'my-web-app',
  method: 'docker'
});

// Check logs, debug issues, etc.
```

### Use Case 3: Remote SSH Connection
```javascript
// Connect to remote container via SSH
window.TerminalAPI.createContainerConnection({
  containerName: 'production-server',
  method: 'ssh',
  sshConfig: {
    host: '192.168.1.100',
    port: 2222,
    username: 'admin',
    password: 'secure-password'
  }
});
```

## Next Steps

1. ✅ Test basic Docker exec connection
2. ✅ Test basic SSH connection
3. ✅ Test connection via UI buttons
4. ✅ Test with multiple containers
5. ✅ Test terminal resize
6. ✅ Test session reconnection
7. ⚠️ Consider adding authentication for production
8. ⚠️ Consider using WSS (secure WebSocket) for production

## API Reference

### TerminalAPI.createContainerConnection(options)

**Parameters:**
```typescript
{
  containerName?: string;  // Use this OR containerId
  containerId?: string;    // Use this OR containerName
  method: 'docker' | 'ssh'; // Default: 'docker'
  sshConfig?: {            // Required if method='ssh'
    host: string;
    port: number;
    username: string;
    password: string;
  }
}
```

**Returns:** `boolean` - true if initiated successfully

**Example:**
```javascript
const success = window.TerminalAPI.createContainerConnection({
  containerName: 'my-app',
  method: 'docker'
});

if (success) {
  console.log('Terminal connection started!');
}
```

## Getting Help

1. **Check logs:**
   - Browser console for client errors
   - Terminal/console where Meteor is running for server errors

2. **Inspect WebSocket:**
   - Chrome DevTools → Network → WS tab
   - See actual WebSocket messages

3. **Check container status:**
   ```bash
   docker ps -a
   docker logs <container-name>
   ```

4. **Read documentation:**
   - `PATH_ROUTING.md` - Full technical documentation
   - `IMPLEMENTATION_SUMMARY.md` - Implementation details
   - This file - Quick start guide

## Happy Terminal-ing! 🚀
