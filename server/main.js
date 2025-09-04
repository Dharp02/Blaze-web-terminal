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

