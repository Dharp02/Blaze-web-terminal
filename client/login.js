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
                alert(error)
            }else{
               FlowRouter.go('home');
            }
        }
    );  

    
  },


});


