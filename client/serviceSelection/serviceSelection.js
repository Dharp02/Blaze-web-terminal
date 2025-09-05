import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import { Meteor } from "meteor/meteor";
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { Roles } from 'meteor/roles';
import "./serviceSelection.html";
import "./serviceSelection.css";



// Template.serviceSelection.helpers({




  

//   debugRoles() {
//     console.log('=== DEBUG ROLES ===');
//     console.log('User ID:', Meteor.userId());
//     console.log('Current User:', Meteor.user());
//     console.log('User Roles:', Roles.getRolesForUser(Meteor.userId()));
//     console.log('Is Admin:', Roles.userIsInRole(Meteor.userId(), 'admin'));
//     console.log('Is User:', Roles.userIsInRole(Meteor.userId(), 'user'));
//     console.log('Role Assignment Collection:', Meteor.roleAssignment.find().fetch());
//     return '';
//   },
  

  
// })


Template.serviceSelection.events({
  'click .vm-card': function(event) {
      FlowRouter.go('login');
    
  },
  'click .container-card': function(event) {
    FlowRouter.go('login');
  }
});