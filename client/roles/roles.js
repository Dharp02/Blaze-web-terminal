import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import { Meteor } from "meteor/meteor";
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { Roles } from 'meteor/roles';
import "./roles.html";
import "./roles.css";




Template.serviceSelection.events({
  'click .vm-card': function(event) {
     const selectedRole = event.currentTarget.dataset.role;
    
    if (selectedRole === 'admin') {
      // Call method to check if user can access admin
      Meteor.call('isCurrentUserAdmin', (error, result) => {
        if (result) {
          // Redirect to admin dashboard
          FlowRouter.go('/containerManager');
        } else {
          alert('You do not have admin privileges');
        }
      });
    } else {
      // Redirect to user dashboard
      FlowRouter.go('/login');
    }
  },
  'click .user-card': function(event) {
    FlowRouter.go('login');
  }
});