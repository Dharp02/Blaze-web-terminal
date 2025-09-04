// client/main.js
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { Roles } from 'meteor/roles';
import 'meteor/dharapo:blaze-terminal';
import 'meteor/dharapo:blaze-container-management'

// Import templates
import './main.html';
import "./login/login.js";
import "./register/register.js";
import "./mainWrapper/mainWrapper.js";
import "./passwordReset/passwordReset.js";
import "./roles/roles.js";


FlowRouter.route('/', {
  name: 'root',
  action() {
    if(Meteor.userId())

      FlowRouter.go('home');
    else{
      FlowRouter.go('login');
    }
    
  }
});

FlowRouter.route('/home', {
  name: 'home',
  action() {
    if(Meteor.userId())
     this.render('terminalApp', 'mainWrapper');
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


FlowRouter.route('/changePassword', {
  name: 'changePassword',
  action() {
    if(Meteor.userId()){
      this.render('terminalApp', 'changePassword');
    }
  }
});

FlowRouter.route('/roles', {
  name: 'roles',
  action() {
      this.render('terminalApp', 'serviceSelection');
    }
});