import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { ServiceConfiguration } from 'meteor/service-configuration';
import {Roles} from 'meteor/roles';
import { check, Match } from 'meteor/check';

Meteor.startup(async () => {
await Roles.createRoleAsync("user");
await Roles.createRoleAsync("admin");
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


Meteor.publish(null, function() {
  if (this.userId) {
    return Meteor.roleAssignment.find({ 'user._id': this.userId });
  } else {
    this.ready();
  }
});
