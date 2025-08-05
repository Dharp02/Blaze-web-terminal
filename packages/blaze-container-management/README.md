# Blaze Container Management

A powerful Meteor package for managing Docker containers with an intuitive web interface. Create, manage, and connect to SSH-enabled Docker containers directly from your Meteor application.

##  Features

-  **Docker Container Management**: Create, start, stop, and delete containers
-  **SSH Access**: Automatic SSH server setup with configurable credentials
-  **Favorites System**: Mark containers as favorites with persistent storage
-  **Dockerfile Import**: Import and build custom Docker images from Dockerfiles
-  **Port Management**: Automatic port assignment and easy copying
-  **Real-time Updates**: Live container status monitoring
-  **Modern UI**: Clean, responsive interface built with Blaze
-  **Persistent State**: Favorites survive page refreshes using localStorage

##  Quick Start

### Prerequisites

- Meteor.js application
- Docker installed and running on the server
- Node.js with Docker API access

### Installation

```bash
meteor add your-username:blaze-container-management
```

### Setup

1. **Install Docker dependencies:**
```bash
npm install dockerode
```

2. **Add the template to your application:**
```html
<template name="yourTemplate">
  {{> containerManager}}
</template>
```

3. **Include the package in your route or template:**
```javascript
import 'meteor/your-username:blaze-container-management';
```

##  Package Structure

```
packages/blaze-container-management/
├── client/
│   ├── container-management.html    # Main template
│   ├── container-management.js      # Client-side logic
│   └── container-management.css     # Styling
├── server/
│   ├── methods.js                   # Server methods
│   └── Dockerfile                   # Default SSH container image
├── package.js                       # Package configuration
└── README.md                        # This file
```

##  Configuration

### Default Dockerfile

The package includes a default Debian-based Dockerfile with SSH server:

```dockerfile
FROM debian:latest
RUN apt-get update && apt-get install -y openssh-server && apt-get clean
RUN mkdir /var/run/sshd
RUN echo 'root:password123' | chpasswd
RUN sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin yes/' /etc/ssh/sshd_config
RUN sed -i 's/UsePAM yes/UsePAM no/g' /etc/ssh/sshd_config
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D"]
```

### Customization

You can customize the default credentials by modifying the Dockerfile in your package directory.

##  Usage

### Creating Containers

1. Click the **"Create"** button
2. The system will build the SSH-enabled image (first time only)
3. A new container will be created with a random SSH port
4. Connection details will be displayed

### Managing Containers

- ** Favorite**: Click the star icon to mark containers as favorites
- ** Connect**: Click to get SSH connection details
- ** Copy Port**: Click the port number to copy it to clipboard
- ** Stop**: Click the × button to stop and remove containers

### Importing Dockerfiles

1. Click the **📥 import button**
2. Select a Dockerfile from your computer
3. The system will build a custom image
4. Optionally create a container from the new image

### SSH Connection

Default credentials for created containers:
- **Host**: localhost
- **Port**: Auto-assigned (displayed in UI)
- **Username**: root
- **Password**: password123

```bash
ssh root@localhost -p <assigned-port>
```

##  API Reference

### Server Methods

#### `createContainer()`
Creates a new SSH-enabled container.

**Returns:**
```javascript
{
  success: true,
  containerId: "abc123...",
  containerName: "ssh-container-1234567890",
  sshPort: "32774"
}
```

#### `listContainers()`
Lists all containers with formatted data for the UI.

**Returns:**
```javascript
[
  {
    id: "abc123...",
    name: "ssh-container-1234567890",
    image: "debian-ssh-server",
    status: "running",
    publicPort: "32774",
    created: "1/31/2025, 2:45:30 PM"
  }
]
```

#### `closeContainer(containerId)`
Stops and removes a container.

**Parameters:**
- `containerId` (String): Container ID to remove

#### `buildImageFromDockerfile(dockerfileContent, fileName)`
Builds a Docker image from uploaded Dockerfile content.

**Parameters:**
- `dockerfileContent` (String): Content of the Dockerfile
- `fileName` (String): Original filename

#### `toggleContainerFavorite(containerId, isFavorite)`
Toggles favorite status for a container.

**Parameters:**
- `containerId` (String): Container ID
- `isFavorite` (Boolean): New favorite state

### Client-side Reactive Variables

```javascript
// Access container data
const containers = displayedContainers.get();

// Check if any containers exist
const hasAnyContainers = hasContainers.get();

// Get current tab
const activeTab = currentTab.get(); // 'active' or 'favorites'
```

##  Customization

### Styling

The package includes default CSS classes that can be overridden:

```css
.container-card { /* Container card styling */ }
.tab-button.active { /* Active tab styling */ }
.status-badge.running { /* Running status badge */ }
.clickable-port { /* Clickable port styling */ }
```

### Templates

You can extend the functionality by creating custom templates that include the containerManager:

```html
<template name="customDashboard">
  <div class="dashboard-header">
    <h1>My Container Dashboard</h1>
  </div>
  
  {{> containerManager}}
  
  <div class="dashboard-footer">
    <!-- Custom footer content -->
  </div>
</template>
```

##  Security Considerations

- **SSH Credentials**: Change default password in production
- **Container Access**: Containers run with root access
- **Network Exposure**: SSH ports are exposed on host
- **File Uploads**: Validate Dockerfile content before building

##  Troubleshooting

### Common Issues

**Docker not found:**
```
Error: Cannot connect to Docker daemon
```
**Solution**: Ensure Docker is installed and running on the server.

**Permission denied:**
```
Error: permission denied while trying to connect to Docker daemon
```
**Solution**: Add the Meteor user to the docker group or run with appropriate permissions.

**Port conflicts:**
```
Error: port already in use
```
**Solution**: The package automatically assigns random ports to avoid conflicts.

**Build failures:**
```
Error: Dockerfile build failed
```
**Solution**: Check Dockerfile syntax and ensure base images are available.

##  Development

### Local Development

1. Clone the package to your `packages/` directory
2. Run `meteor add dharapo:blaze-container-management`
3. Start your Meteor application

### Testing

```bash
# Test container creation
meteor shell
> Meteor.call('createContainer')

# Test container listing
> Meteor.call('listContainers')
```

##  Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request


##  Support

- **Issues**: Report bugs on GitHub Issues
- **Discussions**: Join the community discussions
- **Documentation**: Check the Meteor Guide for more examples

##  Acknowledgments

- Built with [Meteor.js](https://meteor.com)
- Docker integration via [dockerode]
- UI components inspired by modern container management tools

---

**Happy Container Management!** 

