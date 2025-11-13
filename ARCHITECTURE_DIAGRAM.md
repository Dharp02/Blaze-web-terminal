# Architecture Diagram: Path-Based WebSocket Routing

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BLAZE WEB TERMINAL                              │
│                        Path-Based WebSocket Routing                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                                  BROWSER                                     │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Container Management UI                                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │  │
│  │  │ Container 1  │  │ Container 2  │  │ Container 3  │               │  │
│  │  │ alpine-test  │  │ ssh-server   │  │ web-app      │               │  │
│  │  │ [Connect ▼]  │  │ [Connect ▼]  │  │ [Connect ▼]  │               │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │  │
│  │         │                  │                  │                        │  │
│  │         └──────────────────┴──────────────────┘                        │  │
│  │                            │                                            │  │
│  │          User clicks "Connect" → Choose method                         │  │
│  │                ┌────────────┴────────────┐                             │  │
│  │         [Docker Exec]          [SSH]                                   │  │
│  └──────────────────────────────────────────────────────────────────────────┘
│                    │                        │                                │
│                    ▼                        ▼                                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  window.TerminalAPI.createContainerConnection()                       │  │
│  │                                                                        │  │
│  │  Method: 'docker'              Method: 'ssh'                          │  │
│  │  No credentials needed         Requires sshConfig                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                    │                        │                                │
│                    └────────────┬───────────┘                                │
│                                 ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  WebSocket Client (connectWebSocket)                                  │  │
│  │                                                                        │  │
│  │  new WebSocket(url)                                                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                                   │ WebSocket Connection
                                   │
    ┌──────────────────────────────┴─────────────────────────────────┐
    │                                                                  │
    │  Docker Exec Path                    SSH Path                   │
    │                                                                  │
    ▼                                      ▼                           │
┌────────────────────────────┐  ┌──────────────────────────────────┐ │
│ ws://localhost:3002        │  │ ws://localhost:3002              │ │
│ /socket/name/alpine-test   │  │ /socket/name/ssh-server          │ │
│ ?method=docker             │  │ ?method=ssh                      │ │
└────────────────────────────┘  └──────────────────────────────────┘ │
                                                                      │
┌──────────────────────────────────────────────────────────────────────────────┐
│                              SERVER (Node.js)                                │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  HTTP Server (port 3002)                                              │  │
│  │                                                                        │  │
│  │  this.server.on('upgrade', async (request, socket, head) => {         │  │
│  │    const pathname = url.parse(request.url).pathname;                  │  │
│  │    const query = url.parse(request.url, true).query;                  │  │
│  │                                                                        │  │
│  │    // Parse: /socket/name/container-name                              │  │
│  │    const pathMatch = pathname.match(/^\/socket\/(name|id)\/(.+)$/);   │  │
│  │    const method = query.method || 'ssh';                              │  │
│  │  })                                                                    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                            │                                                 │
│                            ▼                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Container Validation                                                 │  │
│  │                                                                        │  │
│  │  getContainerInfo(type, identifier)                                   │  │
│  │    → Query Docker API                                                 │  │
│  │    → Validate container exists                                        │  │
│  │    → Validate container is running                                    │  │
│  │    → Return: { id, name, state, sshPort }                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                            │                                                 │
│                            ▼                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  WebSocket Upgrade                                                    │  │
│  │                                                                        │  │
│  │  this.wss.handleUpgrade(request, socket, head, (ws) => {              │  │
│  │    ws.containerInfo = containerInfo;  // Attach container context     │  │
│  │    ws.connectionMethod = method;      // 'docker' or 'ssh'            │  │
│  │    this.wss.emit('connection', ws);                                   │  │
│  │  });                                                                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                            │                                                 │
│                            ▼                                                 │
│           ┌────────────────┴─────────────────┐                              │
│           │                                  │                              │
│           ▼                                  ▼                              │
│  ┌─────────────────────┐          ┌──────────────────────┐                 │
│  │ createDockerTerminal│          │ createSSHTerminal    │                 │
│  │                     │          │                      │                 │
│  │ method='docker'     │          │ method='ssh'         │                 │
│  └─────────────────────┘          └──────────────────────┘                 │
│           │                                  │                              │
│           ▼                                  ▼                              │
└──────────────────────────────────────────────────────────────────────────────┘
            │                                  │
            │                                  │
            ▼                                  ▼
┌─────────────────────────┐        ┌───────────────────────────┐
│    DOCKER DAEMON        │        │    SSH CONNECTION         │
│                         │        │                           │
│  container.exec({       │        │  ssh.connect({            │
│    Cmd: ['/bin/bash'],  │        │    host: 'localhost',     │
│    Tty: true,           │        │    port: 32774,           │
│    AttachStdin: true,   │        │    username: 'root',      │
│    AttachStdout: true   │        │    password: 'changeme'   │
│  })                     │        │  })                       │
│                         │        │                           │
│  ┌──────────────────┐   │        │  ┌────────────────────┐  │
│  │   /bin/bash      │   │        │  │   SSH Session      │  │
│  │   PTY Stream     │   │        │  │   Shell Stream     │  │
│  └──────────────────┘   │        │  └────────────────────┘  │
└─────────────────────────┘        └───────────────────────────┘
            │                                  │
            │                                  │
            └──────────────┬───────────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │    Terminal Stream           │
            │                              │
            │  • Bidirectional data flow   │
            │  • Input from browser        │
            │  • Output to browser         │
            │  • Resize handling           │
            │  • Session management        │
            └──────────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │     XTERM.JS TERMINAL        │
            │      (in Browser)            │
            │                              │
            │  User sees interactive       │
            │  terminal with bash prompt   │
            └──────────────────────────────┘
```

## Message Flow Diagram

### Docker Exec Connection Flow

```
Browser                    Server                     Docker
  │                          │                          │
  │ 1. Click Connect         │                          │
  │    (Docker Exec)         │                          │
  │──────────────────────────>│                          │
  │                          │                          │
  │ 2. WS Upgrade Request    │                          │
  │    GET /socket/name/x    │                          │
  │    ?method=docker        │                          │
  │──────────────────────────>│                          │
  │                          │ 3. Validate Container    │
  │                          │────────────────────────> │
  │                          │<──────────────────────── │
  │                          │   (Container info)       │
  │                          │                          │
  │ 4. WS Upgrade 101        │                          │
  │<──────────────────────────│                          │
  │                          │                          │
  │ 5. WS Connected          │                          │
  │<─────────────────────────>│                          │
  │                          │                          │
  │ 6. create_terminal msg   │                          │
  │──────────────────────────>│                          │
  │                          │ 7. docker.exec()         │
  │                          │────────────────────────> │
  │                          │<──────────────────────── │
  │                          │   (Exec stream)          │
  │                          │                          │
  │ 7. terminal_created msg  │                          │
  │<──────────────────────────│                          │
  │                          │                          │
  │ 8. terminal_input        │                          │
  │──────────────────────────>│──────────────────────────>│
  │                          │   (Write to stream)      │
  │                          │                          │
  │ 9. terminal_output       │  (Read from stream)      │
  │<──────────────────────────│<──────────────────────────│
  │                          │                          │
```

### SSH Connection Flow

```
Browser                    Server                     SSH
  │                          │                          │
  │ 1. Click Connect         │                          │
  │    (SSH)                 │                          │
  │──────────────────────────>│                          │
  │                          │                          │
  │ 2. WS Upgrade Request    │                          │
  │    GET /socket/name/x    │                          │
  │    ?method=ssh           │                          │
  │──────────────────────────>│                          │
  │                          │ 3. Validate Container    │
  │                          │────────────────────────> │
  │                          │<──────────────────────── │
  │                          │   (Container info)       │
  │                          │                          │
  │ 4. WS Upgrade 101        │                          │
  │<──────────────────────────│                          │
  │                          │                          │
  │ 5. WS Connected          │                          │
  │<─────────────────────────>│                          │
  │                          │                          │
  │ 6. create_terminal msg   │                          │
  │    + sshConfig           │                          │
  │──────────────────────────>│                          │
  │                          │ 7. SSH Connect           │
  │                          │────────────────────────> │
  │                          │   (localhost:32774)      │
  │                          │                          │
  │                          │ 8. SSH Authenticate      │
  │                          │────────────────────────> │
  │                          │<──────────────────────── │
  │                          │   (Success)              │
  │                          │                          │
  │                          │ 9. Request Shell         │
  │                          │────────────────────────> │
  │                          │<──────────────────────── │
  │                          │   (Shell stream)         │
  │                          │                          │
  │ 10. terminal_created msg │                          │
  │<──────────────────────────│                          │
  │                          │                          │
  │ 11. terminal_input       │                          │
  │──────────────────────────>│──────────────────────────>│
  │                          │   (Write to shell)       │
  │                          │                          │
  │ 12. terminal_output      │  (Read from shell)       │
  │<──────────────────────────│<──────────────────────────│
  │                          │                          │
```

## Key Differences: Docker Exec vs SSH

```
┌─────────────────────┬─────────────────────────┬─────────────────────────┐
│     Feature         │     Docker Exec         │          SSH            │
├─────────────────────┼─────────────────────────┼─────────────────────────┤
│ Connection Time     │ ~50-200ms               │ ~500-1500ms             │
├─────────────────────┼─────────────────────────┼─────────────────────────┤
│ Authentication      │ None (Docker daemon)    │ Username/Password       │
├─────────────────────┼─────────────────────────┼─────────────────────────┤
│ Port Binding        │ Not required            │ Required (22 exposed)   │
├─────────────────────┼─────────────────────────┼─────────────────────────┤
│ Container Req       │ Running only            │ Running + SSH server    │
├─────────────────────┼─────────────────────────┼─────────────────────────┤
│ Use Case            │ Local development       │ Remote/Production       │
├─────────────────────┼─────────────────────────┼─────────────────────────┤
│ Security            │ Docker socket access    │ SSH authentication      │
├─────────────────────┼─────────────────────────┼─────────────────────────┤
│ Setup Complexity    │ None                    │ SSH server in container │
└─────────────────────┴─────────────────────────┴─────────────────────────┘
```

## URL Pattern Breakdown

```
ws://localhost:3002/socket/name/alpine-test?method=docker
│   │          │    │      │    │           │      │
│   │          │    │      │    │           │      └─ Query: method parameter
│   │          │    │      │    │           └──────── Container identifier
│   │          │    │      │    └──────────────────── Type: name or id
│   │          │    │      └───────────────────────── Path prefix
│   │          │    └──────────────────────────────── Port
│   │          └───────────────────────────────────── Host
│   └──────────────────────────────────────────────── Protocol
│
WebSocket Secure (use wss:// for production)
```

## Data Flow: Terminal Input/Output

```
User Types in Terminal
        │
        ▼
┌────────────────────┐
│  XTerm.js Handler  │
│  onData() event    │
└────────────────────┘
        │
        ▼
┌────────────────────┐
│  WebSocket Send    │
│  { type: 'input',  │
│    sessionId: ..., │
│    input: 'ls\n' } │
└────────────────────┘
        │
        ▼
┌────────────────────┐
│  Server Routes     │
│  handleInput()     │
└────────────────────┘
        │
        ├──[Docker]──> stream.write('ls\n')
        │
        └──[SSH]────> sshStream.write('ls\n')
                              │
                              ▼
                    ┌──────────────────┐
                    │  Shell Execution │
                    │  /bin/bash       │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Output: file1   │
                    │         file2    │
                    └──────────────────┘
                              │
                              ▼
        ┌──[Docker]──< stream.on('data')
        │
        └──[SSH]────< sshStream.on('data')
                │
                ▼
┌────────────────────┐
│  WebSocket Send    │
│  { type: 'output', │
│    sessionId: ..., │
│    data: 'file1..' │
└────────────────────┘
        │
        ▼
┌────────────────────┐
│  XTerm.js Write    │
│  term.write(data)  │
└────────────────────┘
        │
        ▼
  User Sees Output
```

## Session Management

```
┌─────────────────────────────────────────────────────────────┐
│                    Server Sessions Map                      │
│                                                             │
│  sessionId → {                                              │
│    id: 'abc123',                                            │
│    method: 'docker' | 'ssh',                                │
│    containerName: 'my-container',                           │
│    stream: DockerStream | SSHStream,                        │
│    ws: WebSocket,                                           │
│    isConnected: true,                                       │
│    cols: 100,                                               │
│    rows: 30,                                                │
│    createdAt: '2025-11-13T...',                             │
│    disconnectedAt: null                                     │
│  }                                                          │
│                                                             │
│  • Supports reconnection                                   │
│  • 30-minute timeout for disconnected sessions             │
│  • Cleanup on stream close                                 │
└─────────────────────────────────────────────────────────────┘
```
