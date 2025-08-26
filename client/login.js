import { Session } from 'meteor/session';
import { Accounts } from 'meteor/accounts-base';
import "./login.html";
import "./login.css";

Template.login.helpers({
  loginError() {
    return Session.get('loginError');
  },
  
  isLoading() {
    return Session.get('loginLoading');
  },
  
  showForgotPasswordModal() {
    return Session.get('showForgotPasswordModal');
  },
  
  forgotPasswordError() {
    return Session.get('forgotPasswordError');
  },
  
  forgotPasswordSuccess() {
    return Session.get('forgotPasswordSuccess');
  },
  
  isSendingResetEmail() {
    return Session.get('isSendingResetEmail');
  }
});

Template.login.events({
  'submit #login-form'(event, template) {
    event.preventDefault();
    
    if (Session.get('loginLoading')) {
      return;
    }
    
    const formData = new FormData(event.target);
    const email = formData.get('email');
    const password = formData.get('password');
    const role = formData.get('role');
    const rememberMe = formData.get('rememberMe');
    
    Session.set('loginLoading', true);
    Session.set('loginError', null);
    
    template.$('input, select, button').prop('disabled', true);
    
    // Login with email instead of username
    Meteor.loginWithPassword(email, password, (error) => {
      Session.set('loginLoading', false);
      template.$('input, select, button').prop('disabled', false);
      
      if (error) {
        Session.set('loginError', error.reason);
      } else {
        // Store role and remember me preference
        Meteor.users.update(Meteor.userId(), {
          $set: { 
            'profile.role': role,
            'profile.rememberMe': !!rememberMe
          }
        });
        
        FlowRouter.go('/');
      }
    });
  },

  // Forgot Password Modal
  'click [data-action="forgotPassword"]'(event) {
    event.preventDefault();
    Session.set('showForgotPasswordModal', true);
    Session.set('forgotPasswordError', null);
    Session.set('forgotPasswordSuccess', null);
  },

  'click [data-action="closeForgotPasswordModal"]'(event) {
    event.preventDefault();
    Session.set('showForgotPasswordModal', false);
    Session.set('forgotPasswordError', null);
    Session.set('forgotPasswordSuccess', null);
  },

  'click .modal-overlay'(event) {
    if (event.target === event.currentTarget) {
      Session.set('showForgotPasswordModal', false);
    }
  },

  'submit #forgot-password-form'(event) {
    event.preventDefault();
    
    if (Session.get('isSendingResetEmail')) {
      return;
    }
    
    const formData = new FormData(event.target);
    const email = formData.get('email');
    
    if (!email) {
      Session.set('forgotPasswordError', 'Email is required');
      return;
    }
    
    Session.set('isSendingResetEmail', true);
    Session.set('forgotPasswordError', null);
    Session.set('forgotPasswordSuccess', null);
    
    Accounts.forgotPassword({ email }, (error) => {
      Session.set('isSendingResetEmail', false);
      
      if (error) {
        Session.set('forgotPasswordError', error.reason);
      } else {
        Session.set('forgotPasswordSuccess', true);
        // Auto-close modal after 3 seconds
        setTimeout(() => {
          Session.set('showForgotPasswordModal', false);
          Session.set('forgotPasswordSuccess', null);
        }, 3000);
      }
    });
  },

  // Social Login
  'click [data-action="loginWithGoogle"]'(event) {
    event.preventDefault();
    
    Meteor.loginWithGoogle({
      requestPermissions: ['email', 'profile']
    }, (error) => {
      if (error) {
        Session.set('loginError', 'Google login failed: ' + error.reason);
      } else {
        // Set default role for social login
        Meteor.users.update(Meteor.userId(), {
          $set: { 'profile.role': 'user' }
        });
        FlowRouter.go('/');
      }
    });
  },

  'click [data-action="loginWithFacebook"]'(event) {
    event.preventDefault();
    
    Meteor.loginWithFacebook({
      requestPermissions: ['email']
    }, (error) => {
      if (error) {
        Session.set('loginError', 'Facebook login failed: ' + error.reason);
      } else {
        // Set default role for social login
        Meteor.users.update(Meteor.userId(), {
          $set: { 'profile.role': 'user' }
        });
        FlowRouter.go('/');
      }
    });
  }
});