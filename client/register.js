import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import "./register.html";
import "./login.css"
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
        } else if (error.reason === "Email already exists.") {
          alert("Email already exists.");
        } else {
          // Password strength feedback
          const password = passwordInput.value;
          let feedback = [];
          if (password.length < 8) {
            feedback.push("Password is too short (min 8 characters)");
          }
          if (!/[0-9]/.test(password)) {
            feedback.push("Password must include a number");
          }
          if (!/[A-Z]/.test(password)) {
            feedback.push("Password must include an uppercase letter");
          }
          if (!/[a-z]/.test(password)) {
            feedback.push("Password must include a lowercase letter");
          }
          if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            feedback.push("Password must include a special character");
          }
          if (feedback.length > 0) {
            alert("Password issues:\n" + feedback.join("\n"));
          } else {
            alert("Account created! Password is strong.");
            FlowRouter.go('login');
          }
        }
      },  
    );
  },


});