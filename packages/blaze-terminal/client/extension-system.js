import { ReactiveVar } from 'meteor/reactive-var';

console.log(' Terminal Extension System initializing...');

// Global registry for connection providers
const connectionProviders = new ReactiveVar([]);

/**
 * Terminal Extension System
 * Allows other packages to register new connection types
 */
export const TerminalExtensions = {
  
  /**
   * Register a new connection provider
   * Called by extension packages to add new connection types
   */
  registerConnectionProvider(provider) {
    console.log(` Registering connection provider: ${provider.type}`);
    
    // Validate provider
    if (!provider.type || !provider.name) {
      throw new Error('Provider must have type and name');
    }
    
    // Add to registry
    const current = connectionProviders.get();
    const updated = [...current, provider];
    connectionProviders.set(updated);
    
    console.log(` Provider registered: ${provider.name}`);
  },
  
  /**
   * Get all registered connection providers
   */
  getConnectionProviders() {
    return connectionProviders.get();
  },
  
  /**
   * Find provider by type
   */
  getProvider(type) {
    return connectionProviders.get().find(p => p.type === type);
  }
};

// Register the default SSH provider
TerminalExtensions.registerConnectionProvider({
  type: 'ssh',
  name: 'SSH Connection',
  icon: '🔑',
  description: 'Connect to remote servers via SSH',
  connectButtonText: 'Connect to SSH'
});

// Make globally available for extensions
window.TerminalExtensions = TerminalExtensions;

console.log(' Terminal Extension System ready');