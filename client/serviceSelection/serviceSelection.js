import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Meteor } from "meteor/meteor";
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import "./serviceSelection.html";
import "./serviceSelection.css";





Template.serviceSelection.events({
  'click .vm-card': function(event) {
    Meteor.logout(() => {
    FlowRouter.go('login');
  });

  },
  
  'click .Available-Containers': function(event) {
    
  }
});

