import { Session } from 'meteor/session';
import "./login.html";
import "./login.css";


Template.login.helpers({
  loginError() {
    return Session.get('loginError');
  },
  
  isLoading() {
    return Session.get('loginLoading');
  }
});

Template.login.events({
  'submit #login-form'(event, template) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const username = formData.get('username');
    const password = formData.get('password');
    const role = formData.get('role');
    
    Session.set('loginLoading', true);
    Session.set('loginError', null);
    
    // Your login logic here
    Meteor.loginWithPassword(username, password, (error) => {
      Session.set('loginLoading', false);
      
      if (error) {
        Session.set('loginError', error.reason);
      } else {
        // Store role if needed
        Meteor.users.update(Meteor.userId(), {
          $set: { 'profile.role': role }
        });
        
        FlowRouter.go('/'); // Redirect after successful login
      }
    });
  }
});