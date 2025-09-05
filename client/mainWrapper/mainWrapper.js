import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Meteor } from "meteor/meteor";
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

import "./mainWrapper.html";
import "./mainWrapper.css";

Template.mainWrapper.onCreated(function() {
});

Template.mainWrapper.events({
  'click #logout-btn': function(event, template) {
    event.preventDefault();
    Meteor.logout(() => {
      FlowRouter.go('login');
    });
  },

  'click #settings-btn': function(event, template) {
    event.preventDefault();
    const dropdown = template.$('#settings-dropdown');
    dropdown.toggleClass('show');
  },

  'click #change-password-btn': function(event, template) {
    event.preventDefault();
    FlowRouter.go('changePassword');
  }
});

Template.mainWrapper.helpers({
 
})