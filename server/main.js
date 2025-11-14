import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { ServiceConfiguration } from 'meteor/service-configuration';
import {Roles} from 'meteor/roles';
import { check, Match } from 'meteor/check';
import { WebApp } from 'meteor/webapp';
import http from 'http';

Meteor.startup(async () => {
  // Setup WebSocket proxy for /socket/* requests
  WebApp.httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Only proxy /socket/* paths to the terminal WebSocket server
    if (url.pathname.startsWith('/socket/')) {
      console.log('📡 Proxying WebSocket connection:', url.pathname);
      
      const options = {
        hostname: 'localhost',
        port: 3002,
        path: req.url,
        headers: req.headers
      };
      
      const proxyReq = http.request(options);
      
      proxyReq.on('upgrade', (res, proxySocket, proxyHead) => {
        console.log('✅ WebSocket proxy connected:', url.pathname);
        
        socket.write(`HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n`);
        res.rawHeaders.forEach((header, i) => {
          if (i % 2 === 0) {
            socket.write(`${header}: ${res.rawHeaders[i + 1]}\r\n`);
          }
        });
        socket.write('\r\n');
        
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
        
        // Log disconnections
        socket.on('close', () => {
          console.log('🔌 WebSocket proxy disconnected:', url.pathname);
        });
      });
      
      proxyReq.on('error', (err) => {
        console.error('❌ WebSocket proxy error:', err.message, url.pathname);
        socket.destroy();
      });
      
      proxyReq.end();
    }
    // If not /socket/*, let Meteor handle it (e.g., for DDP WebSocket connections)
  });
  
  console.log('🚀 WebSocket proxy configured for /socket/* → localhost:3002');
  
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


Meteor.methods({
  async assignRole(role) {
    check(role, Match.OneOf('user', 'admin'));
    if (!Meteor.userId()) {
      throw new Meteor.Error('not-authorized');
    }
    await Roles.addUsersToRolesAsync(Meteor.userId(), role);
  }
});