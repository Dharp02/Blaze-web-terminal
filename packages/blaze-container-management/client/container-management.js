// Container Manager Blaze JavaScript - Boilerplate with Fake Data

// Fake data generators
const generateFakeContainers = () => {
  const images = ['ubuntu:20.04', 'nginx:latest', 'node:16-alpine', 'postgres:13', 'redis:6.2', 'python:3.9'];
  const statuses = ['running', 'stopped', 'paused'];
  const names = ['web-server', 'api-backend', 'database', 'cache-server', 'worker-1', 'frontend'];
  
  return Array.from({ length: 6 }, (_, i) => ({
    id: `container_${Math.random().toString(36).substr(2, 12)}`,
    Id: `container_${Math.random().toString(36).substr(2, 12)}`,
    name: names[i] || `container-${i + 1}`,
    Names: [`/${names[i] || `container-${i + 1}`}`],
    image: images[i % images.length],
    Image: images[i % images.length],
    status: `Up ${Math.floor(Math.random() * 24)} hours`,
    Status: `Up ${Math.floor(Math.random() * 24)} hours`,
    state: statuses[Math.floor(Math.random() * statuses.length)],
    State: statuses[Math.floor(Math.random() * statuses.length)],
    created: Date.now() / 1000 - Math.random() * 86400 * 7, // Random time in last week
    Created: Date.now() / 1000 - Math.random() * 86400 * 7,
    Ports: [{
      PublicPort: 2200 + i,
      PrivatePort: 22,
      Type: 'tcp'
    }]
  }));
};

// Template helpers
Template.containerManager.helpers({
  // Check if active tab is selected
  isActiveTab() {
    return Template.instance().activeTab.get() === 'active';
  },

  // Check if favorites tab is selected
  isFavoritesTab() {
    return Template.instance().activeTab.get() === 'favorites';
  },

  // Get container count for active tab
  containerCount() {
    const containers = Template.instance().containers.get();
    return containers ? containers.length : 0;
  },

  // Get favorites count
  favoritesCount() {
    const favorites = Template.instance().favorites.get();
    const containers = Template.instance().containers.get();
    if (!favorites || !containers) return 0;
    
    return favorites.filter(fav => 
      containers.some(c => (c.id || c.Id) === (fav.id || fav.Id))
    ).length;
  },

  // Check if currently creating container
  isCreating() {
    return Template.instance().isCreating.get();
  },

  // Check if connection modal should be shown
  showConnectionModal() {
    return Template.instance().showConnectionModal.get();
  },

  // Get selected container for modal
  selectedContainer() {
    return Template.instance().selectedContainer.get();
  },

  // Get containers to display based on active tab
  displayedContainers() {
    const instance = Template.instance();
    const activeTab = instance.activeTab.get();
    const containers = instance.containers.get() || [];
    const favorites = instance.favorites.get() || [];

    if (activeTab === 'favorites') {
      return favorites.filter(fav => {
        const favId = fav.id || fav.Id;
        return containers.some(c => (c.id || c.Id) === favId);
      }).map(fav => {
        const container = containers.find(c => (c.id || c.Id) === (fav.id || fav.Id));
        return enhanceContainerData(container, favorites);
      });
    }

    return containers.map(container => enhanceContainerData(container, favorites));
  },

  // Check if there are containers to display
  hasContainers() {
    const containers = Template.containerManager.__helpers.get('displayedContainers').call(this);
    return containers && containers.length > 0;
  }
});

// Helper function to enhance container data
function enhanceContainerData(container, favorites) {
  if (!container) return null;

  const containerId = container.id || container.Id;
  const name = container.name || (container.Names && container.Names[0] ? container.Names[0].replace('/', '') : 'Unnamed');
  const image = container.image || container.Image || 'Unknown Image';
  const status = container.status || container.Status || 'Unknown';
  const state = container.state || container.State || 'Unknown';
  const createdTime = container.created || container.Created;
  
  return {
    id: containerId,
    name: name,
    image: image,
    status: status,
    state: state,
    truncatedId: containerId.substring(0, 12),
    created: createdTime ? new Date(createdTime * 1000).toLocaleString() : 'N/A',
    publicPort: getPublicPort(container),
    statusClass: state.toLowerCase(),
    isFavorite: favorites.some(fav => (fav.id || fav.Id) === containerId)
  };
}

// Helper function to get public port
function getPublicPort(container) {
  try {
    if (container.Ports && Array.isArray(container.Ports) && container.Ports.length > 0) {
      const portWithPublic = container.Ports.find(port => port.PublicPort);
      if (portWithPublic) {
        return portWithPublic.PublicPort;
      }
    }
    return 'N/A';
  } catch (error) {
    console.error('Error getting port:', error);
    return 'N/A';
  }
}

// Template created
Template.containerManager.onCreated(function() {
  const instance = this;
  
  // Reactive variables
  instance.containers = new ReactiveVar([]);
  instance.favorites = new ReactiveVar([]);
  instance.isCreating = new ReactiveVar(false);
  instance.activeTab = new ReactiveVar('active');
  instance.showConnectionModal = new ReactiveVar(false);
  instance.selectedContainer = new ReactiveVar(null);

  // Load favorites from localStorage
  const savedFavorites = localStorage.getItem('favorite-containers');
  if (savedFavorites) {
    try {
      instance.favorites.set(JSON.parse(savedFavorites));
    } catch (error) {
      console.error('Error parsing saved favorites:', error);
      localStorage.removeItem('favorite-containers');
      instance.favorites.set([]);
    }
  }

  // Generate initial fake data
  instance.containers.set(generateFakeContainers());

  // Simulate periodic updates (fake data changes)
  instance.pollInterval = Meteor.setInterval(() => {
    // Randomly update container statuses
    const containers = instance.containers.get();
    const updatedContainers = containers.map(container => ({
      ...container,
      status: `Up ${Math.floor(Math.random() * 24)} hours`,
      Status: `Up ${Math.floor(Math.random() * 24)} hours`
    }));
    instance.containers.set(updatedContainers);
  }, 10000); // Update every 10 seconds

  // Watch favorites and save to localStorage
  instance.autorun(() => {
    const favorites = instance.favorites.get();
    localStorage.setItem('favorite-containers', JSON.stringify(favorites));
  });
});

// Template destroyed
Template.containerManager.onDestroyed(function() {
  const instance = this;
  if (instance.pollInterval) {
    Meteor.clearInterval(instance.pollInterval);
  }
});

// Template events
Template.containerManager.events({
  // Tab switching
  'click [data-action="setActiveTab"]'(event, instance) {
    const tab = event.currentTarget.dataset.tab;
    instance.activeTab.set(tab);
  },

  // Create container (fake implementation)
  'click [data-action="createContainer"]'(event, instance) {
    if (instance.isCreating.get()) return;

    instance.isCreating.set(true);
    
    // Simulate API delay
    Meteor.setTimeout(() => {
      const containers = instance.containers.get();
      const newContainer = {
        id: `container_${Math.random().toString(36).substr(2, 12)}`,
        Id: `container_${Math.random().toString(36).substr(2, 12)}`,
        name: `new-container-${containers.length + 1}`,
        Names: [`/new-container-${containers.length + 1}`],
        image: 'ubuntu:latest',
        Image: 'ubuntu:latest',
        status: 'Up 1 minute',
        Status: 'Up 1 minute',
        state: 'running',
        State: 'running',
        created: Date.now() / 1000,
        Created: Date.now() / 1000,
        Ports: [{
          PublicPort: 2200 + containers.length,
          PrivatePort: 22,
          Type: 'tcp'
        }]
      };
      
      instance.containers.set([...containers, newContainer]);
      instance.isCreating.set(false);
      
      // Show success message
      alert(`Container "${newContainer.name}" created successfully!`);
    }, 2000); // 2 second delay to simulate API call
  },

  // Import Dockerfile (fake implementation)
  'click [data-action="importDockerfile"]'(event, instance) {
    const fileInput = document.getElementById('dockerfile-upload');
    fileInput.click();
  },

  // Handle file upload (fake implementation)
  'change #dockerfile-upload'(event, instance) {
    const file = event.target.files[0];
    if (!file) return;

    instance.isCreating.set(true);
    
    // Simulate file processing
    Meteor.setTimeout(() => {
      const containers = instance.containers.get();
      const newContainer = {
        id: `container_${Math.random().toString(36).substr(2, 12)}`,
        Id: `container_${Math.random().toString(36).substr(2, 12)}`,
        name: `imported-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}`,
        Names: [`/imported-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}`],
        image: 'custom:latest',
        Image: 'custom:latest',
        status: 'Up 1 minute',
        Status: 'Up 1 minute',
        state: 'running',
        State: 'running',
        created: Date.now() / 1000,
        Created: Date.now() / 1000,
        Ports: [{
          PublicPort: 2200 + containers.length,
          PrivatePort: 22,
          Type: 'tcp'
        }]
      };
      
      instance.containers.set([...containers, newContainer]);
      instance.isCreating.set(false);
      event.target.value = '';
      
      alert(`Dockerfile "${file.name}" imported successfully!`);
    }, 3000); // 3 second delay to simulate processing
  },

  // Toggle favorite
  'click [data-action="toggleFavorite"]'(event, instance) {
    const containerId = event.currentTarget.dataset.containerId;
    const containers = instance.containers.get();
    const favorites = instance.favorites.get();
    
    const container = containers.find(c => (c.id || c.Id) === containerId);
    if (!container) return;

    const isFavorite = favorites.some(fav => (fav.id || fav.Id) === containerId);
    
    if (isFavorite) {
      // Remove from favorites
      const newFavorites = favorites.filter(fav => (fav.id || fav.Id) !== containerId);
      instance.favorites.set(newFavorites);
    } else {
      // Add to favorites
      const containerCopy = { ...container, addedToFavoritesAt: new Date().toISOString() };
      instance.favorites.set([...favorites, containerCopy]);
    }
  },

  // Stop container (fake implementation)
  'click [data-action="stopContainer"]'(event, instance) {
    const containerId = event.currentTarget.dataset.containerId;
    const containerName = event.currentTarget.dataset.containerName;
    
    if (!confirm(`Are you sure you want to stop container "${containerName}"?`)) {
      return;
    }

    // Simulate API delay
    Meteor.setTimeout(() => {
      const containers = instance.containers.get();
      const newContainers = containers.filter(container => 
        (container.id || container.Id) !== containerId
      );
      instance.containers.set(newContainers);
      
      // Remove from favorites
      const favorites = instance.favorites.get();
      const newFavorites = favorites.filter(fav => (fav.id || fav.Id) !== containerId);
      instance.favorites.set(newFavorites);
      
      alert(`Container "${containerName}" stopped successfully!`);
    }, 1000); // 1 second delay
  },

  // Copy port to clipboard
  'click [data-action="copyPort"]'(event, instance) {
    const port = event.currentTarget.dataset.port;
    const containerName = event.currentTarget.dataset.containerName;
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(port.toString()).then(() => {
        alert(`Port ${port} copied to clipboard!\nUse this port in the SSH connection form.`);
      }).catch(err => {
        fallbackCopyToClipboard(port, containerName);
      });
    } else {
      fallbackCopyToClipboard(port, containerName);
    }
  },

  // Connect to container
  'click [data-action="connectToContainer"]'(event, instance) {
    const containerId = event.currentTarget.dataset.containerId;
    const containerName = event.currentTarget.dataset.containerName;
    const containerPort = event.currentTarget.dataset.containerPort;
    const containerHost = event.currentTarget.dataset.containerHost;
    
    const containerInfo = {
      id: containerId,
      name: containerName,
      port: containerPort,
      host: containerHost
    };
    
    instance.selectedContainer.set(containerInfo);
    instance.showConnectionModal.set(true);
  },

  // Close modal
  'click [data-action="closeModal"]'(event, instance) {
    instance.showConnectionModal.set(false);
    instance.selectedContainer.set(null);
    
    // Clear password field
    const passwordInput = document.getElementById('container-password');
    if (passwordInput) {
      passwordInput.value = '';
    }
  },

  // Connect to container from modal (fake implementation)
  'click .modal-btn.connect-btn'(event, instance) {
    event.preventDefault();
    
    const passwordInput = document.getElementById('container-password');
    const password = passwordInput ? passwordInput.value.trim() : '';
    
    if (!password) {
      alert('Please enter a password');
      return;
    }

    const selectedContainer = instance.selectedContainer.get();
    if (!selectedContainer) return;

    const connectionInfo = {
      host: selectedContainer.host,
      port: selectedContainer.port,
      username: 'root',
      password: password,
      name: selectedContainer.name
    };

    // Simulate connection
    console.log('Connecting to container with info:', connectionInfo);
    alert(`Connecting to ${selectedContainer.name} on port ${selectedContainer.port}...\n(This is a demo - no actual connection made)`);

    // Close modal
    instance.showConnectionModal.set(false);
    instance.selectedContainer.set(null);
    if (passwordInput) passwordInput.value = '';
  },

  // Handle Enter key in password field
  'keypress #container-password'(event, instance) {
    if (event.which === 13) { // Enter key
      const connectButton = document.querySelector('.modal-btn.connect-btn');
      if (connectButton) {
        connectButton.click();
      }
    }
  },

  // Close modal when clicking overlay
  'click .modal-overlay'(event, instance) {
    if (event.target === event.currentTarget) {
      instance.showConnectionModal.set(false);
      instance.selectedContainer.set(null);
    }
  }
});

// Helper function for fallback clipboard copy
function fallbackCopyToClipboard(port, containerName) {
  const textArea = document.createElement('textarea');
  textArea.value = port.toString();
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
  alert(`Port ${port} copied to clipboard!\nUse this port in the SSH connection form.`);
}

// Template rendered
Template.containerManager.onRendered(function() {
  // Set focus to password input when modal opens
  this.autorun(() => {
    if (this.showConnectionModal.get()) {
      Meteor.setTimeout(() => {
        const passwordInput = document.getElementById('container-password');
        if (passwordInput) {
          passwordInput.focus();
        }
      }, 100);
    }
  });
});

// Demo functions for testing
window.containerManagerDemo = {
  addRandomContainer: function() {
    const instance = Template.instance();
    if (!instance) {
      console.error('Template instance not found');
      return;
    }
    
    const containers = instance.containers.get();
    const images = ['ubuntu:20.04', 'nginx:latest', 'node:16-alpine', 'postgres:13', 'redis:6.2'];
    const randomImage = images[Math.floor(Math.random() * images.length)];
    
    const newContainer = {
      id: `demo_${Math.random().toString(36).substr(2, 12)}`,
      Id: `demo_${Math.random().toString(36).substr(2, 12)}`,
      name: `demo-container-${Date.now()}`,
      Names: [`/demo-container-${Date.now()}`],
      image: randomImage,
      Image: randomImage,
      status: 'Up 1 minute',
      Status: 'Up 1 minute',
      state: 'running',
      State: 'running',
      created: Date.now() / 1000,
      Created: Date.now() / 1000,
      Ports: [{
        PublicPort: 2200 + containers.length,
        PrivatePort: 22,
        Type: 'tcp'
      }]
    };
    
    instance.containers.set([...containers, newContainer]);
    console.log('Added demo container:', newContainer.name);
  },
  
  clearAllContainers: function() {
    const instance = Template.instance();
    if (instance) {
      instance.containers.set([]);
      instance.favorites.set([]);
      console.log('Cleared all containers and favorites');
    }
  },
  
  resetToDefaults: function() {
    const instance = Template.instance();
    if (instance) {
      instance.containers.set(generateFakeContainers());
      instance.favorites.set([]);
      console.log('Reset to default fake data');
    }
  }
};