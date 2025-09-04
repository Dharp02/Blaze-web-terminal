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

Meteor.methods({
  async assignRoleToCurrentUser(roleName) {
    check(roleName, Match.OneOf('user', 'admin'));
    
    // Make sure user is logged in
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }
    
    try {
      // Assign the role to the current user
      await Roles.addUsersToRolesAsync(this.userId, roleName);
      
      console.log(`Role '${roleName}' assigned to user: ${this.userId}`);
      
      return {
        success: true,
        message: `Role '${roleName}' assigned successfully`,
        userId: this.userId,
        role: roleName
      };
      
    } catch (error) {
      console.log('Error assigning role:', error);
      throw new Meteor.Error('role-assignment-failed', error.message);
    }
  },



  // Check if current user is admin
  async isCurrentUserAdmin() {
    // Check if user is logged in
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }
    
    try {
      const isAdmin = await Roles.userIsInRoleAsync(this.userId, 'admin');
      return isAdmin;
    } catch (error) {
      console.log('Error checking admin role:', error);
      return false;
    }
  },

  async getCurrentUserRole() {
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }
    
    try {
      const userRoles = await Roles.getRolesForUserAsync(this.userId);
      return userRoles[0] || 'user'; // Return first role or default to 'user'
    } catch (error) {
      console.log('Error getting user role:', error);
      return 'user';
    }
  }

});

Meteor.publish(null, function() {
  if (this.userId) {
    return Meteor.roleAssignment.find({ 'user._id': this.userId });
  } else {
    this.ready();
  }
});
