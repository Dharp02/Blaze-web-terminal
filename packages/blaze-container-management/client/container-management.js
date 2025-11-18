import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import './container-management.html'
import './container-management.css'

// ===========================================
// REACTIVE VARIABLES
// ===========================================

const displayedContainers = new ReactiveVar([]);
const currentTab = new ReactiveVar('active');
const favoriteFilter = new ReactiveVar(false);

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

function isTerminalPackageAvailable() {
  return typeof window.TerminalAPI !== 'undefined' && window.TerminalAPI.isAvailable();
}

// ===========================================
// STORAGE FUNCTIONS
// ===========================================

function saveFavorites(containers) {
  const favorites = containers
    .filter(c => c.isFavorite)
    .map(c => c.id);
  localStorage.setItem('containerFavorites', JSON.stringify(favorites));
}

function loadFavorites() {
  const saved = localStorage.getItem('containerFavorites');
  return saved ? JSON.parse(saved) : [];
}

function syncFavoritesWithContainers(containers) {
  const currentFavorites = loadFavorites();
  const existingContainerIds = containers.map(c => c.id);
  
  const validFavorites = currentFavorites.filter(id => existingContainerIds.includes(id));
  
  if (validFavorites.length !== currentFavorites.length) {
    localStorage.setItem('containerFavorites', JSON.stringify(validFavorites));
    console.log('🧹 Cleaned up favorites:', currentFavorites.length, '→', validFavorites.length);
    favoriteFilter.set(!favoriteFilter.get());
  }
  
  return validFavorites;
}

// ===========================================
// CONTAINER LOADING FUNCTIONS
// ===========================================

function loadContainers() {
  Meteor.call('listContainers', function(err, containers) {
    if (err) {
      console.error('❌ Error loading containers:', err);
      return;
    }
    
    const validFavoriteIds = syncFavoritesWithContainers(containers);
    
    const containersWithFavorites = containers.map(container => ({
      ...container,
      isFavorite: validFavoriteIds.includes(container.id)
    }));
    
    displayedContainers.set(containersWithFavorites);
    
    console.log('📦 Loaded', containers.length, 'containers,', validFavoriteIds.length, 'favorites');
  });
}

// ===========================================
// TEMPLATE LIFECYCLE
// ===========================================

Template.containerManager.onCreated(function() {
  console.log('📦 Container manager created');
  loadContainers();
});

// ===========================================
// TEMPLATE HELPERS
// ===========================================

Template.containerManager.helpers({
  displayedContainers() {
    const allContainers = displayedContainers.get();
    const activeTab = currentTab.get();
    favoriteFilter.get();
    
    switch (activeTab) {
      case 'active':
        return allContainers.filter(c => c.status === 'running');
      case 'exited':
        return allContainers.filter(c => c.status !== 'running');
      case 'favorites':
        return allContainers.filter(c => c.isFavorite);
      default:
        return allContainers;
    }
  },
  
  hasContainers() {
    const activeTab = currentTab.get();
    const allContainers = displayedContainers.get();
    favoriteFilter.get();
    
    switch (activeTab) {
      case 'active':
        return allContainers.some(c => c.status === 'running');
      case 'exited':
        return allContainers.some(c => c.status !== 'running');
      case 'favorites':
        return allContainers.some(c => c.isFavorite);
      default:
        return allContainers.length > 0;
    }
  },
  
  isActiveTab() {
    return currentTab.get() === 'active';
  },
  
  isExitedTab() {
    return currentTab.get() === 'exited';
  },
  
  isFavoritesTab() {
    return currentTab.get() === 'favorites';
  },
  
  isCreating() {
    return false;
  },
  
  runningCount() {
    return displayedContainers.get().filter(c => c.status === 'running').length;
  },
  
  exitedCount() {
    return displayedContainers.get().filter(c => c.status !== 'running').length;
  },
  
  favoritesCount() {
    favoriteFilter.get();
    return displayedContainers.get().filter(c => c.isFavorite).length;
  },
  
  // NEW: Check if container is running
  isRunning() {
    return this.status === 'running';
  },
  
  // NEW: Check if container is stopped
  isStopped() {
    return this.status !== 'running';
  }
});

// ===========================================
// TEMPLATE EVENTS
// ===========================================

Template.containerManager.events({
  "click .create-container-btn": function(event, template) {
    if (template.$(event.currentTarget).hasClass('disabled')) {
      return;
    }
    
    const btn = template.$('.create-container-btn');
    btn.addClass('disabled');
    
    Meteor.call("createContainer", function(err, result) {
      btn.removeClass('disabled');
      
      if (err) {
        console.error('❌ Error creating container:', err);
        alert('Failed to create container: ' + err.reason);
        return;
      }
      
      console.log('✅ Container created:', result.containerName);
      loadContainers();
    });
  },

  "click .connect-btn": function(event, template) {
    event.preventDefault();
    
    const container = this;
    
    if (!isTerminalPackageAvailable()) {
      alert('⚠️ Terminal package not available');
      return;
    }
    
    if (container.status !== 'running') {
      alert('⚠️ Container must be running to connect. Please start it first.');
      return;
    }
    
    const useDockerExec = confirm(
      `Connect to ${container.name}\n\n` +
      `Choose connection method:\n\n` +
      `OK = Docker Exec (direct, faster)\n` +
      `Cancel = SSH (requires password)`
    );
    
    const method = useDockerExec ? 'docker' : 'ssh';
    const connectionOptions = {
      containerName: container.name,
      method: method
    };
    
    if (method === 'ssh') {
      if (container.publicPort === 'N/A') {
        alert('⚠️ SSH port not available for this container');
        return;
      }
      
      connectionOptions.sshConfig = {
        host: 'localhost',
        port: parseInt(container.publicPort),
        username: 'root',
        password: 'changeme'
      };
    }
    
    const success = window.TerminalAPI.createContainerConnection(connectionOptions);
    
    if (success) {
      const btn = $(event.currentTarget);
      const originalText = btn.text();
      btn.text('✅ Connected!').css('background', '#4caf50');
      
      setTimeout(() => {
        btn.text(originalText).css('background', '');
      }, 2000);
    } else {
      alert('❌ Failed to connect. Please try again.');
    }
  },

  // NEW: Start container button
  "click .start-btn": function(event, template) {
    event.preventDefault();
    
    const containerId = event.currentTarget.getAttribute('data-container-id');
    const containerName = event.currentTarget.getAttribute('data-container-name');
    
    const btn = $(event.currentTarget);
    btn.prop('disabled', true).text('Starting...');

    Meteor.call('startContainer', containerId, function(err, result) {
      btn.prop('disabled', false).text('▶');
      
      if (err) {
        console.error('❌ Error starting container:', err);
        alert('Failed to start container: ' + err.reason);
        return;
      }
      
      console.log('✅ Container started:', containerName);
      
      // Reload containers to refresh UI
      loadContainers();
      
      // Show success message
      const successMsg = `✅ Container "${containerName}" started successfully!`;
      alert(successMsg);
    });
  },

  // UPDATED: Stop container button (doesn't delete)
  "click .stop-btn": function(event, template) {
    event.preventDefault();
    
    const containerId = event.currentTarget.getAttribute('data-container-id');
    const containerName = event.currentTarget.getAttribute('data-container-name');
    
    if (!confirm(`Stop container "${containerName}"?\n\nContainer will be stopped but not deleted.`)) {
      return;
    }
    
    const btn = $(event.currentTarget);
    btn.prop('disabled', true).text('Stopping...');

    Meteor.call('stopContainerOnly', containerId, function(err, result) {
      btn.prop('disabled', false).text('■');
      
      if (err) {
        console.error('❌ Error stopping container:', err);
        alert('Failed to stop container: ' + err.reason);
        return;
      }
      
      console.log('✅ Container stopped:', containerName);
      
      // Reload containers to refresh UI
      loadContainers();
      
      // Show success message
      alert(`✅ Container "${containerName}" stopped successfully!`);
    });
  },

  // NEW: Delete container button (removes completely)
  "click .delete-btn": function(event, template) {
    event.preventDefault();
    
    const containerId = event.currentTarget.getAttribute('data-container-id');
    const containerName = event.currentTarget.getAttribute('data-container-name');
    
    if (!confirm(`Delete container "${containerName}"?\n\nThis action cannot be undone.`)) {
      return;
    }
    
    const btn = $(event.currentTarget);
    btn.prop('disabled', true).text('Deleting...');

    Meteor.call('stopContainer', containerId, function(err, result) {
      btn.prop('disabled', false).text('×');
      
      if (err) {
        console.error('❌ Error deleting container:', err);
        alert('Failed to delete container: ' + err.reason);
        return;
      }
      
      console.log('✅ Container deleted:', containerName);

      // Remove from favorites
      const currentFavorites = loadFavorites();
      const updatedFavorites = currentFavorites.filter(id => id !== containerId);
      localStorage.setItem('containerFavorites', JSON.stringify(updatedFavorites));
      
      // Remove from UI
      const currentContainers = displayedContainers.get();
      const updatedContainers = currentContainers.filter(c => c.id !== containerId);
      displayedContainers.set(updatedContainers);
      
      favoriteFilter.set(!favoriteFilter.get());
      
      alert(`✅ Container "${containerName}" deleted successfully!`);
    });
  },

  "click .favorite-btn": function(event, template) {
    const containerId = event.currentTarget.getAttribute('data-container-id');
    const btn = $(event.currentTarget);
    const currentFavoriteState = btn.hasClass('favorited');
    const newFavoriteState = !currentFavoriteState;
    
    if (newFavoriteState) {
      btn.addClass('favorited').attr('title', 'Remove from favorites');
    } else {
      btn.removeClass('favorited').attr('title', 'Add to favorites');
    }
    
    const currentContainers = displayedContainers.get();
    const updatedContainers = currentContainers.map(container => {
      if (container.id === containerId) {
        return { ...container, isFavorite: newFavoriteState };
      }
      return container;
    });
    
    displayedContainers.set(updatedContainers);
    saveFavorites(updatedContainers);
    favoriteFilter.set(!favoriteFilter.get());
    
    console.log(newFavoriteState ? '⭐ Added to favorites' : '☆ Removed from favorites');
  },

  "click .tab-button": function(event, template) {
    const tab = event.currentTarget.getAttribute('data-tab');
    currentTab.set(tab);
    console.log('📑 Switched to tab:', tab);
  },

  "click .clickable-port[data-action='copyPort']": function(event, template) {
    const port = event.currentTarget.getAttribute('data-port');
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(port).then(() => {
        console.log('📋 Port copied:', port);
        
        const element = $(event.currentTarget);
        const originalContent = element.html();
        element.html(`${port} ✓`);
        
        setTimeout(() => {
          element.html(originalContent);
        }, 1500);
        
      }).catch((err) => {
        console.error('❌ Failed to copy port:', err);
      });
    }
  },

  "click .import-dockerfile-icon-btn[data-action='importDockerfile']": function(event, template) {
    template.$('#dockerfile-upload').click();
  },

  "change #dockerfile-upload": function(event, template) {
    const file = event.target.files[0];
    
    if (!file) return;

    console.log('📥 Importing Dockerfile:', file.name);

    const reader = new FileReader();
    
    reader.onload = function(e) {
      const dockerfileContent = e.target.result;
      
      const btn = template.$('.import-dockerfile-icon-btn');
      btn.prop('disabled', true).text('📤');
      
      Meteor.call('buildImageFromDockerfile', dockerfileContent, file.name, function(err, result) {
        btn.prop('disabled', false).text('📥');
        
        if (err) {
          console.error('❌ Error building image:', err);
          alert('Failed to import Dockerfile: ' + err.reason);
          return;
        }
        
        console.log('✅ Image built:', result.imageName);
        alert(`✅ Dockerfile imported successfully!\nImage: ${result.imageName}`);
        
        template.$('#dockerfile-upload').val('');
      });
    };
    
    reader.onerror = function() {
      console.error('❌ Error reading file');
      alert('Error reading Dockerfile. Please try again.');
    };
    
    reader.readAsText(file);
  }
});