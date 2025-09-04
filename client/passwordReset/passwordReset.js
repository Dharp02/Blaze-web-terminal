import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Meteor } from "meteor/meteor";
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import "./passwordReset.html";
import "../login/login.css"

Template.changePassword.events({
  'click .save-btn': function(event, template) {
    event.preventDefault();
 
    
    const oldPassword = template.find('#oldpassword').value;
    const newPassword = template.find('#password').value;
    const confirmPassword = template.find('#confirmpassword').value;
  
  // Basic validation
  if (!oldPassword || !newPassword || !confirmPassword) {
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


  Accounts.changePassword(
       oldPassword,
        newPassword,
        (error) => {
            if(error){
                alert(error)
            }else{
                alert("Password changed successfully");
                FlowRouter.go('home');
            }
        }, 
    );

 

}
});
