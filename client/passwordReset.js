import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Meteor } from "meteor/meteor";
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import "./passwordReset.html";
import "./login.css"

Template.forgotPassword.events({
  'click .save-btn': function(event, template) {
    event.preventDefault();
 
    const email = template.find('#email').value;
    const newPassword = template.find('#password').value;
    const confirmPassword = template.find('#confirmpassword').value;
  
  // Basic validation
  if (!email || !newPassword || !confirmPassword) {
    alert('Please fill in all fields');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    alert('Passwords do not match');
    return;
  }
  
  if (newPassword.length < 6) {
    alert('Password must be at least 6 characters long');
    return;
  }
  
  Meteor.call('updateUserPassword', email, newPassword, function(error, result) {
  console.log('Method response - Error:', error, 'Result:', result);
    if (error) {
      console.error('Password update error:', error);
      console.error('Error reason:', error.reason);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
      alert('Error updating password: ' + (error.reason || error.message));
    } else {
      alert('Password updated successfully! You can now login with your new password.');
      FlowRouter.go('login');
    }
  });
}
});
