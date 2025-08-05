// Import Tinytest from the tinytest Meteor package.
import { Tinytest } from "meteor/tinytest";

// Import and rename a variable exported by blaze-terminal.js.
import { name as packageName } from "meteor/blaze-terminal";

// Write your tests here!
// Here is an example.
Tinytest.add('blaze-terminal - example', function (test) {
  test.equal(packageName, "blaze-terminal");
});
