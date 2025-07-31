Package.describe({
  name: 'dharapo:blaze-container-management',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: '',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
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
  api.mainModule('client/container-management.js', 'client');

  api.use('ecmascript', 'server');
  api.mainModule('server/main.js', 'server');




});


  
Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('blaze-container-management');
  api.mainModule('blaze-container-management-tests.js');
});
