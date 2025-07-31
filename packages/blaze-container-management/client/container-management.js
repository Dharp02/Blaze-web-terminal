import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import './container-management.html'
import './container-management.css'

const displayedContainers = new ReactiveVar([]);
const hasContainers = new ReactiveVar(false);

// Function to load containers
function loadContainers() {
  Meteor.call('listContainers', function(err, containers) {
    if (err) {
      console.error('Error loading containers:', err);
      return;
    }
    
    displayedContainers.set(containers);
    hasContainers.set(containers.length > 0);
    console.log(' Loaded containers:', containers);
  });
}

// Load existing containers when template is created
Template.containerManager.onCreated(function() {
  loadContainers();
});

Template.containerManager.helpers({
  displayedContainers() {
    return displayedContainers.get();
  },
  hasContainers() {
    return hasContainers.get();
  },
  isActiveTab() {
    return true;
  },
  isCreating() {
    return false;
  },
  containerCount() {
    return displayedContainers.get().length;
  },
  favoritesCount() {
    return displayedContainers.get().filter(container => container.isFavorite).length;
  },
  isFavoritesTab() {
    return false;
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

  "click .favorite-btn" : function(event,target){
    const containerId = event.currentTarget.getAttribute('data-container-id');
    const currentFavoriteState = $(event.currentTarget).hasClass('favorited');
    const newFavoriteState = !currentFavoriteState;
    
    // Disable button during operation
    const btn = $(event.currentTarget);
    btn.prop('disabled', true);
    
    Meteor.call('toggleContainerFavorite', containerId, newFavoriteState, function(err, result) {
      // Re-enable button
      btn.prop('disabled', false);
      
      if (err) {
        console.error('Error toggling favorite:', err);
        alert('Failed to update favorite: ' + err.reason);
        return;
      }
      
      console.log('Favorite toggled successfully:', result);
      
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
      
      // Show feedback
      const message = newFavoriteState ? 'Added to favorites ' : 'Removed from favorites';
      console.log(message);
    });








  }

  
  









});