// client/main.js
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';


import 'meteor/dharapo:blaze-terminal';
import 'meteor/dharapo:blaze-container-management'

// Import templates
import './main.html';
import "./login.html";
import "./login.css";


FlowRouter.route('/', {
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