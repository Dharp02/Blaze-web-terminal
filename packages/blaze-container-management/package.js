Package.describe({
  name: 'dharapo:blaze-container-management',
  version: '0.0.2',
  summary: 'Docker container management with Blaze UI for Meteor applications',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('3.3');
  api.use('ecmascript');
  api.use(['ecmascript', 'templating@1.4.2', 'reactive-var', 'random'], 'client');
  
  api.addFiles([
    'client/container-management.html',
    'client/container-management.css'
  ], 'client');

   api.addAssets([
    'server/Dockerfile',
  ], 'server');

  Npm.depends({
  'dockerode': '4.0.2'  // Use latest stable version
});




  api.mainModule('client/container-management.js', 'client');

  api.use('ecmascript', 'server');
  api.mainModule('server/main.js', 'server');




});


  
Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('dharapo:blaze-container-management');
 
});
