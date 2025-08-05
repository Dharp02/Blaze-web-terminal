// Import Tinytest from the tinytest Meteor package.
import { Tinytest } from "meteor/tinytest";

// Import and rename a variable exported by blaze-container-management.js.
import { name as packageName } from "meteor/blaze-container-management";

// Write your tests here!
// Here is an example.
Tinytest.add('blaze-container-management - example', function (test) {
  test.equal(packageName, "blaze-container-management");
});
