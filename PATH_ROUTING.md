# Path-Based WebSocket Routing

## Overview

The terminal system now supports path-based WebSocket routing, allowing you to connect to containers using URL paths instead of only ports. This provides better organization, clearer debugging, and support for both SSH and direct Docker exec connections.

## WebSocket URL Patterns

### By Container Name
```
ws://localhost:3002/socket/name/{{container-name}}?method={{method}}
```

### By Container ID
```
ws://localhost:3002/socket/id/{{container-id}}?method={{method}}
```

**Note:** Path-based routing is required. All connections must specify a container name or ID.

## Connection Methods

### 1. Docker Exec (Direct)
**No SSH required** - Connects directly to container using Docker exec API

**Advantages:**
- No SSH server needed in container
- Faster connection
- No password required
- Works with any container

**Example:**
```javascript
window.TerminalAPI.createContainerConnection({
  containerName: 'my-container',
  method: 'docker'
});
```

**WebSocket URL:**
```
ws://localhost:3002/socket/name/my-container?method=docker
```

### 2. SSH Method
**Traditional SSH connection** - Connects via SSH to container's exposed port

**Advantages:**
- Works with remote containers
- More secure for production
- Standard SSH authentication

**Example:**
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

**WebSocket URL:**
```
ws://localhost:3002/socket/name/my-container?method=ssh
```

## Server-Side Implementation

The WebSocket server now uses HTTP upgrade handling:

```javascript
// packages/blaze-terminal/server/main.js

this.server.on('upgrade', async (request, socket, head) => {
  const parsedUrl = url.parse(request.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // Parse: /socket/name/container-name or /socket/id/container-id
  const pathMatch = pathname.match(/^\/socket\/(name|id)\/(.+)$/);
  
  if (pathMatch) {
    const [, type, identifier] = pathMatch;
    const method = query.method || 'ssh';
    
    // Validate container exists
    const containerInfo = await this.getContainerInfo(type, identifier);
    
    // Upgrade to WebSocket with container context
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      ws.containerInfo = containerInfo;
      ws.connectionMethod = method;
      this.wss.emit('connection', ws, request);
    });
  }
});
```

## Client-Side API

### Terminal API Methods

#### `createContainerConnection(options)`
Create a connection to a container using name/ID

```javascript
window.TerminalAPI.createContainerConnection({
  containerName: 'ssh-container-123',  // OR use containerId
  method: 'docker',                     // 'docker' or 'ssh'
  sshConfig: {                          // Required only if method='ssh'
    host: 'localhost',
    port: 32774,
    username: 'root',
    password: 'changeme'
  }
});
```

#### `createDirectConnection(sshConfig)` (Legacy)
Create a traditional SSH connection

```javascript
window.TerminalAPI.createDirectConnection({
  host: 'localhost',
  port: 22,
  username: 'user',
  password: 'pass'
});
```

## Container Management UI

When clicking "Connect" on a container, users now see a dialog:

```
Connect to ssh-container-123

Choose connection method:

OK     = Docker Exec (direct, no SSH)
Cancel = SSH (requires password)
```

## Architecture Flow

### Docker Exec Flow
```
User clicks Connect → Select "Docker Exec"
                   ↓
Client opens: ws://localhost:3002/socket/name/container-name?method=docker
                   ↓
Server validates container exists and is running
                   ↓
Server upgrades to WebSocket with containerInfo attached
                   ↓
Client sends: { type: 'create_terminal', sessionId: '...' }
                   ↓
Server calls: docker.getContainer(id).exec({ Cmd: ['/bin/bash'] })
                   ↓
Terminal streams directly from Docker exec
```

### SSH Flow
```
User clicks Connect → Select "SSH"
                   ↓
Client opens: ws://localhost:3002/socket/name/container-name?method=ssh
                   ↓
Server validates container exists and is running
                   ↓
Server upgrades to WebSocket with containerInfo attached
                   ↓
Client sends: { type: 'create_terminal', sshConfig: {...} }
                   ↓
Server creates SSH connection to localhost:{{publicPort}}
                   ↓
Terminal streams from SSH session
```

## Benefits

1. **Clear URLs** - Easy to see which container you're connected to
2. **Better Debugging** - Can inspect WebSocket connections per container
3. **No SSH Required** - Docker exec works without SSH server in container
4. **Backwards Compatible** - Legacy connections still work
5. **Flexible** - Supports both local and remote containers
6. **RESTful Design** - Aligns with modern API patterns

## Migration Notes

### Changes from Legacy
The legacy WebSocket endpoint (direct connection to `ws://localhost:3002`) has been removed. All connections now require path-based routing with a container identifier.

**Old code (no longer supported):**
```javascript
// ❌ This will be rejected
const ws = new WebSocket('ws://localhost:3002');
```

**New code (required):**
```javascript
// ✅ Use container connection API
window.TerminalAPI.createContainerConnection({
  containerName: 'my-container',
  method: 'docker'  // or 'ssh'
});
```

## Testing

### Test Docker Exec
```bash
# Start a container
docker run -d --name test-container alpine sleep 1000

# Connect via UI or:
window.TerminalAPI.createContainerConnection({
  containerName: 'test-container',
  method: 'docker'
});
```

### Test SSH
```bash
# Container must have SSH server running
window.TerminalAPI.createContainerConnection({
  containerName: 'ssh-container-123',
  method: 'ssh',
  sshConfig: {
    host: 'localhost',
    port: 32774,
    username: 'root',
    password: 'changeme'
  }
});
```

## Error Handling

The server validates:
- Container exists
- Container is running
- SSH config is valid (for SSH method)
- Returns appropriate HTTP status codes:
  - `404` - Container not found
  - `400` - Container not running
  - `101` - Successful upgrade

## Future Enhancements

Possible future additions:
- `/socket/port/{{port-number}}` - Connect by SSH port
- Authentication/authorization on WebSocket upgrade
- Support for kubectl exec (Kubernetes containers)
- Multi-container sessions
- Session persistence across server restarts
