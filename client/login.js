import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import { Meteor } from "meteor/meteor";
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

import "./login.html";
import "./login.css";


Template.login.helpers({
  
});

Template.login.events({
  'click .login-btn' : function(event, template) {    
    const usernameInput = document.getElementById('email').value;  
    const passwordInput = document.getElementById('password').value;

    Meteor.loginWithPassword(usernameInput,
        passwordInput,
        
        (error)=>{
            if(error){
                alert(error);
            
            } else {
              FlowRouter.go('home');
            }
        }
      );
  },

  'click .google-btn': function(event, template) {
    Meteor.loginWithGoogle(err => {
      if (!err) {
        alert('Successfully Logged In');
        FlowRouter.go('home');
      } 
      else{
        alert(err.reason || 'Unknown Error');
      }
    });

    
  },

  'click .facebook-btn': function(event, template) {
    const provider = event.currentTarget.dataset.provider;

    if (provider === 'facebook') {
      Meteor.loginWithFacebook({
        requestPermissions: ['user_friends', 'public_profile', 'email']
      }, (err) => {
        if (err) {
          alert("Error logging in with Facebook");
        } else {
          FlowRouter.go('home');
        }
      });
    } else {
      alert('Unknown provider: ' + provider);
    }
  },

  'click .Signup-btn': function(event, template) {
    FlowRouter.go('register');
    
  }


});


