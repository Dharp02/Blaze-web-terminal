import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { ServiceConfiguration } from 'meteor/service-configuration';
import { Roles } from 'meteor/roles';
import { check, Match } from 'meteor/check';
import { WebApp } from 'meteor/webapp';
import http from 'http';

// ===========================================
// STARTUP CONFIGURATION
// ===========================================

Meteor.startup(async () => {
  console.log('🚀 Meteor server starting...');
  
  // Setup WebSocket proxy for terminal connections
  setupWebSocketProxy();
  
  // Initialize roles
  await initializeRoles();
  
  // Configure OAuth providers
  await configureOAuth();
  
  console.log('✅ Meteor server startup complete');
});

// ===========================================
// WEBSOCKET PROXY SETUP
// ===========================================

function setupWebSocketProxy() {
  WebApp.httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Only proxy /socket/* paths to the terminal WebSocket server
    if (url.pathname.startsWith('/socket/')) {
      console.log('📡 Proxying WebSocket:', url.pathname);
      
      const options = {
        hostname: 'localhost',
        port: 3002,
        path: req.url,
        headers: req.headers
      };
      
      const proxyReq = http.request(options);
      
      proxyReq.on('upgrade', (res, proxySocket, proxyHead) => {
        console.log('✅ WebSocket proxy connected:', url.pathname);
        
        // Forward response headers
        socket.write(`HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n`);
        res.rawHeaders.forEach((header, i) => {
          if (i % 2 === 0) {
            socket.write(`${header}: ${res.rawHeaders[i + 1]}\r\n`);
          }
        });
        socket.write('\r\n');
        
        // Pipe data bidirectionally
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
        
        // Log disconnections
        socket.on('close', () => {
          console.log('🔌 WebSocket proxy disconnected:', url.pathname);
        });
        
        proxySocket.on('error', (err) => {
          console.error('❌ Proxy socket error:', err.message);
          socket.destroy();
        });
      });
      
      proxyReq.on('error', (err) => {
        console.error('❌ WebSocket proxy error:', err.message, url.pathname);
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\nTerminal server unavailable');
        socket.destroy();
      });
      
      proxyReq.end();
    }
    // If not /socket/*, let Meteor handle it (DDP WebSocket connections)
  });
  
  console.log('🚀 WebSocket proxy configured: /socket/* → localhost:3002');
}

// ===========================================
// ROLES INITIALIZATION
// ===========================================

async function initializeRoles() {
  try {
    // Create default roles if they don't exist
    const existingRoles = await Roles.getAllRoles().fetchAsync();
    const roleNames = existingRoles.map(r => r.name);
    
    if (!roleNames.includes('user')) {
      await Roles.createRoleAsync('user');
      console.log('✅ Created role: user');
    }
    
    if (!roleNames.includes('admin')) {
      await Roles.createRoleAsync('admin');
      console.log('✅ Created role: admin');
    }
    
    console.log('✅ Roles initialized');
  } catch (error) {
    console.error('❌ Error initializing roles:', error);
  }
}

// ===========================================
// OAUTH CONFIGURATION
// ===========================================

async function configureOAuth() {
  try {
    // Check if Google OAuth settings are provided
    if (!Meteor.settings.google || !Meteor.settings.google.clientId || !Meteor.settings.google.secret) {
      console.warn('⚠️ Google OAuth not configured (missing settings)');
      return;
    }
    
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
    
    console.log('✅ Google OAuth configured');
  } catch (error) {
    console.error('❌ Error configuring Google OAuth:', error);
  }
}

// ===========================================
// PUBLICATIONS
// ===========================================

Meteor.publish(null, function() {
  if (this.userId) {
    return Meteor.roleAssignment.find({ 'user._id': this.userId });
  } else {
    this.ready();
  }
});

// ===========================================
// METHODS
// ===========================================

Meteor.methods({
  async assignRole(role) {
    check(role, Match.OneOf('user', 'admin'));
    
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'Must be logged in to assign roles');
    }
    
    await Roles.addUsersToRolesAsync(this.userId, role);
    console.log('✅ Role assigned:', role, 'to user:', this.userId);
  }
});