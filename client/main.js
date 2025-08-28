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
    this.render('terminalApp', 'container');
  }
});
FlowRouter.route('/login', {
  name: 'login',
  action() {
    this.render('terminalApp', 'login');
  }
});

FlowRouter.route('/register', {
  name: 'register',
  action() {
    this.render('terminalApp', 'register');
  }
});