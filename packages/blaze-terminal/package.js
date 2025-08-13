Package.describe({
  name: 'dharapo:blaze-terminal',
  version: '0.0.3',
  summary: 'Terminal component for Meteor with Blaze',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('3.3');
  api.use(['ecmascript', 'templating@1.4.2', 'reactive-var', 'random'], 'client');
  
  api.addFiles([
    'client/terminal.html',
    'client/terminal.css'
  ], 'client');
  
  api.mainModule('client/terminal.js', 'client');


  
  api.use('ecmascript', 'server');
  api.mainModule('server/main.js', 'server');


   Npm.depends({
    "ssh2": "1.16.0",
    "ws": "8.18.3",
    "xterm": "5.3.0",
    "xterm-addon-fit": "0.8.0"
    });

});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('dharapo:blaze-terminal');
  api.mainModule('blaze-terminal-tests.js');
});