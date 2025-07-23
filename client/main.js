// client/main.js
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

// Import templates
import './main.html';

// Import terminal component
import '../imports/ui/terminal.js';

// Import styles
import '../imports/ui/terminal.css';

// Global app initialization
Template.terminalApp.onCreated(function() {
  console.log('Terminal App initialized');
});

Template.terminalApp.helpers({
  // Add any global helpers here
});

Template.terminalApp.events({
  // Add any global events here
});

// Handle global keyboard shortcuts
document.addEventListener('keydown', function(event) {
  // Ctrl/Cmd + ` to toggle terminal (like VS Code)
  if ((event.ctrlKey || event.metaKey) && event.key === '`') {
    event.preventDefault();
    
    // Import the reactive var from terminal.js if needed
    // For now, we'll dispatch a custom event that the terminal can listen to
    const toggleEvent = new CustomEvent('terminal-toggle');
    document.dispatchEvent(toggleEvent);
  }
  
  // Ctrl/Cmd + Shift + ` to create new terminal
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === '`') {
    event.preventDefault();
    
    const newTerminalEvent = new CustomEvent('terminal-new');
    document.dispatchEvent(newTerminalEvent);
  }
});

// Handle window resize for better terminal fitting
let resizeTimeout;
window.addEventListener('resize', function() {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(function() {
    const fitEvent = new CustomEvent('terminal-fit-all');
    document.dispatchEvent(fitEvent);
  }, 250);
});