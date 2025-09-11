import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import "./register.html";
import "../login/login.css"
import { Accounts } from "meteor/accounts-base";
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
Template.register.helpers({
  
});

Template.register.events({
  'click .login-btn' : function(event, template) {  

    const EmailInput = document.getElementById('email');  
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const roleInput = document.querySelector('input[name="role"]:checked').value;
  
    Accounts.createUser(
      {
        email: EmailInput.value,
        username: usernameInput.value,
        password: passwordInput.value
      },
      async(error) => {
        if (error) {
          alert("Error creating user: " + error.message);
        } else {
            await Meteor.call('assignRole', roleInput);
            if (roleInput === 'user') {
              FlowRouter.go('serviceSelection');
          } else {
            FlowRouter.go('login');
          }
      }
    }  
    );
    },


});