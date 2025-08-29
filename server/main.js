import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { ServiceConfiguration } from 'meteor/service-configuration';

Meteor.startup(async () => {

    try {
      await ServiceConfiguration.configurations.upsertAsync(
        { service: 'google' },
        {
          $set: {
            clientId: Meteor.settings.google.clientId,
            secret: Meteor.settings.google.secret,
            loginStyle: 'popup'
          }
        }
      );
      console.log(' Google OAuth configured successfully');
    
    } catch (error) {
      console.error(' Error configuring Google OAuth:', error);
    }

 
  console.log(' OAuth configuration completed!');
});


Meteor.methods({
  async updateUserPassword(email, newPassword) {
    // Validate inputs
    if (!email || !newPassword) {
      throw new Meteor.Error('invalid-input', 'Email and password are required');
    }
    
    if (newPassword.length < 6) {
      throw new Meteor.Error('password-too-short', 'Password must be at least 6 characters long');
    }
    
    try {
  
    const user = await Accounts.findUserByEmail(email);
    const NewPassword = await Accounts.setPasswordAsync(user._id, newPassword);
      console.log('Found user:', user);
      return {
        success: true,
        message: 'Password updated successfully'
      };
    
    } catch (error) {
      console.error('Password update failed:', error);
      throw new Meteor.Error('update-failed', 'Failed to update password. Please try again.');
    }
    
  }
});