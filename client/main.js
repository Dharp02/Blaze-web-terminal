// client/main.js
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

import 'meteor/dharapo:blaze-terminal';
import 'meteor/dharapo:blaze-container-management'

// Import templates
import './main.html';
import "./login.js";
import "./register.html";
import "./register.js";

FlowRouter.route('/home', {
  name: 'home',
  action() {
    if(Meteor.userId())
     this.render('terminalApp', 'container');
    else{
      FlowRouter.go('login');
    }
    
  }
});
FlowRouter.route('/login', {
  name: 'login',
  action() {
    if(Meteor.userId())
      FlowRouter.go('home');
    else
    this.render('terminalApp', 'login');
  }
});

FlowRouter.route('/register', {
  name: 'register',
  action() {
    if(Meteor.userId())
      FlowRouter.go('home');
    this.render('terminalApp', 'register');
  }
});

Template.container.onCreated(async function() {
  
});

Template.container.events({
  'click #logout-btn': function(event, template) {
    event.preventDefault();
    Meteor.logout(() => {
      FlowRouter.go('login');
    });
  }
});


