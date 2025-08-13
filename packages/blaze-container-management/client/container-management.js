import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import './container-management.html'
import './container-management.css'

const displayedContainers = new ReactiveVar([]);
const hasContainers = new ReactiveVar(false);
const currentTab = new ReactiveVar('active');
const favoriteFilter = new ReactiveVar(false);


function isTerminalPackageAvailable() {
  return typeof window.TerminalAPI !== 'undefined' && window.TerminalAPI.isAvailable();
}

/**
 * Create connection data from container info
 */
function createConnectionData(container) {
  return {
    host: 'localhost',
    port: parseInt(container.publicPort),
    username: 'root',
    password: 'changeme' // Default container password
  };
}


function showContainerConnectionModal(container) {
 
  const connectionInfo = `
    Container: ${container.name}
    Host: localhost
    Port: ${container.publicPort}
    Username: root
    Password: changeme

    Use these details in your SSH client.
      `;
  
  alert(connectionInfo);
}

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

// Function to load containers
function loadContainers() {
  Meteor.call('listContainers', function(err, containers) {
    if (err) {
      console.error('Error loading containers:', err);
      return;
    }
    
    // Restore favorite status from localStorage
    const favoriteIds = loadFavorites();
    const containersWithFavorites = containers.map(container => ({
      ...container,
      isFavorite: favoriteIds.includes(container.id)
    }));
    
    displayedContainers.set(containersWithFavorites);
    hasContainers.set(containersWithFavorites.length > 0);
    console.log(' Loaded containers with favorites restored');
  });
}

// Load existing containers when template is created
Template.containerManager.onCreated(function() {
  loadContainers();
});

Template.containerManager.helpers({
  displayedContainers() {
     const allContainers = displayedContainers.get();
     const activeTab = currentTab.get();
     favoriteFilter.get();
    
    if (activeTab === 'favorites') {
      // Show only favorited containers
      return allContainers.filter(container => container.isFavorite === true);
    }
    
    return allContainers;
  },
  hasContainers() {
    const activeTab = currentTab.get();
    const allContainers = displayedContainers.get();
    favoriteFilter.get();
    
    if (activeTab === 'favorites') {
      const favoriteContainers = allContainers.filter(container => container.isFavorite === true);
      return favoriteContainers.length > 0;
    }
    
    return allContainers.length > 0;
  },
  
  isActiveTab() {
    return currentTab.get() === 'active';
  },
  isCreating() {
    return false;
  },
  containerCount() {
    return displayedContainers.get().length;
  },
  favoritesCount() {
    favoriteFilter.get();
    return displayedContainers.get().filter(container => container.isFavorite).length;
  },
  isFavoritesTab() {
    return currentTab.get() === 'favorites';
  }
});

Template.containerManager.events({
  "click .create-container-btn": function(event, template){
    // Prevent multiple clicks
    if (template.$(event.currentTarget).hasClass('disabled')) {
      return;
    }
    
    // Set creating state
    template.$('.create-container-btn').addClass('disabled');
    
    Meteor.call("createContainer", function(err, res){
      // Remove creating state
      template.$('.create-container-btn').removeClass('disabled');
      
      if (err) {
        console.error('Error creating container:', err);
        alert('Failed to create container: ' + err.reason);
        return;
      }
      
      console.log('Container created successfully:', res);
      
      // Refresh the container list to show all containers
      loadContainers();
      
      
    });
  },

  "click .connect-btn": function(event, template) {
  event.preventDefault();
  
  const container = this; // Container data from template context
  
  console.log(' Connect button clicked for:', container.name);
  
  // Check if terminal package is available
  if (isTerminalPackageAvailable()) {
    console.log(' Terminal package detected - using direct integration');
    
    // Create SSH config for container
    const sshConfig = createConnectionData(container);
    
    console.log(' Connecting to container:', sshConfig);
    
    // Use terminal package directly
    const success = window.TerminalAPI.createDirectConnection(sshConfig);
    
    if (success) {
      console.log(' Direct connection successful');
      
      // Optional: Show success feedback
      const btn = $(event.currentTarget);
      const originalText = btn.text();
      btn.text('Connected!').css('background', '#4caf50');
      
      setTimeout(() => {
        btn.text(originalText).css('background', '');
      }, 2000);
      
    } else {
      console.error(' Direct connection failed');
      alert('Failed to connect to container. Please try again.');
    }
    
  } else {
    console.log(' Terminal package not available - using fallback modal');
    
    //  Show original connection modal 
    showContainerConnectionModal(container);
  }
},

  "click .stop-btn ": function(event, template){
    const containerId = event.currentTarget.getAttribute('data-container-id');
    const containerName = event.currentTarget.getAttribute('data-container-name');
    
    // Confirm before deleting
    if (!confirm(`Are you sure you want to close and delete container "${containerName}"?\n\nThis action cannot be undone.`)) {
      return;
    }
    
    // Disable the button during deletion
    const btn = $(event.currentTarget);
    btn.prop('disabled', true).text('Closing...');

    Meteor.call('stopContainer', containerId, function(err, result) {
      // Re-enable button
      btn.prop('disabled', false).text('×');
      
      if (err) {
        console.error('Error closing container:', err);
        alert('Failed to close container: ' + err.reason);
        return;
      }
      
      console.log('Container closed successfully:', result);
      
      // Remove container from the display list
      const currentContainers = displayedContainers.get();
      const updatedContainers = currentContainers.filter(container => container.id !== containerId);
      displayedContainers.set(updatedContainers);
      hasContainers.set(updatedContainers.length > 0);
      
      // Show success message
      alert(` Container "${containerName}" has been closed and deleted successfully!`);
    });
  },

  "click .favorite-btn" : function(event,template){
    const containerId = event.currentTarget.getAttribute('data-container-id');
    const btn = $(event.currentTarget);
    const currentFavoriteState = btn.data('favorited') === true;
    const newFavoriteState = !currentFavoriteState;
    // Disable button during operation
    if (newFavoriteState) {
    btn.addClass('favorited').attr('title', 'Remove from favorites').data('favorited', true);
  } else {
    btn.removeClass('favorited').attr('title', 'Add to favorites').data('favorited', false);
  }
    
      
      // Update the container in the display list
      const currentContainers = displayedContainers.get();
      const updatedContainers = currentContainers.map(container => {
        if (container.id === containerId) {
          return {
            ...container,
            isFavorite: newFavoriteState
          };
        }
        
        return container;
      });
      
      displayedContainers.set(updatedContainers);
      saveFavorites(updatedContainers);
      favoriteFilter.set(!favoriteFilter.get());
      // Show feedback
      const message = newFavoriteState ? 'Added to favorites ' : 'Removed from favorites';
      console.log(message);
    


  },

  "click .tab-button": function(event, template) {
    const tab = event.currentTarget.getAttribute('data-tab');
    currentTab.set(tab);
    
    console.log(`Switched to ${tab} tab`);
  },

  "click .clickable-port[data-action='copyPort']": function(event, template) {
   const port = event.currentTarget.getAttribute('data-port');
  
   if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(port).then(() => {
      // Just log to console instead of fancy notification
      console.log(` Port ${port} copied to clipboard!`);
      
      // Simple visual feedback on the element itself
      const element = $(event.currentTarget);
      const originalContent = element.html();
      element.html(`${port} `);
      
      setTimeout(() => {
        element.html(originalContent);
      }, 1500);
      
    }).catch((err) => {
      console.error('Failed to copy port:', err);
    });
    }
  },

  "click .import-dockerfile-icon-btn[data-action='importDockerfile']": function(event, template) {
    // Trigger the hidden file input
    template.$('#dockerfile-upload').click();
  },

  "change #dockerfile-upload": function(event, template) {
    const file = event.target.files[0];
    
    if (!file) {
      return; // No file selected
    }

    console.log(` Importing Dockerfile: ${file.name}`);

    // Read the file content
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const dockerfileContent = e.target.result;
      console.log('Dockerfile content loaded');
      
      // Call server method to build image from content
      template.$('.import-dockerfile-icon-btn').prop('disabled', true).text('📤');
      
      Meteor.call('buildImageFromDockerfile', dockerfileContent, file.name, function(err, result) {
        // Re-enable button
        template.$('.import-dockerfile-icon-btn').prop('disabled', false).text('📥');
        
        if (err) {
          console.error('Error building image from Dockerfile:', err);
          alert('Failed to import Dockerfile: ' + err.reason);
          return;
        }
        
        console.log('Image built successfully:', result);
        alert(` Dockerfile imported successfully!\nImage: ${result.imageName}`);
        
        // Clear the file input for next use
        template.$('#dockerfile-upload').val('');
      });
    };
    
    reader.onerror = function() {
      console.error('Error reading file');
      alert('Error reading Dockerfile. Please try again.');
    };
    
    // Read the file as text
    reader.readAsText(file);
  },




});