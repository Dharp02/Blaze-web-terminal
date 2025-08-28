import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import "./register.html";
import "./login.css";
import { Accounts } from "meteor/accounts-base";
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

Template.register.helpers({
  
});

Template.register.events({
  'click .login-btn' : function(event, template) {  

    const EmailInput = document.getElementById('email');  
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    Accounts.createUser(
      {
        email: EmailInput.value,
        username: usernameInput.value,
        password: passwordInput.value
      },
      (error) => {
        if (error) {
          alert("Error creating user: " + error.message);
        } else {
          FlowRouter.go('login');
        }
      },  
    );
  },


});