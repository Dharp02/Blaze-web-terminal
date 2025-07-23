import { Meteor } from 'meteor/meteor';

Meteor.startup(() => {
  console.log('Terminal App Server Started!');
  console.log('Server running on:', Meteor.absoluteUrl());
  
  // Initialize any server-side collections or configurations here
  
  // You can add server-side terminal functionality here later
  // For example, WebSocket connections for real shell commands
});

