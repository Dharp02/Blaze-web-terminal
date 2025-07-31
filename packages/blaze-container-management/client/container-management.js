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
  }
});