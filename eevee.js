'use strict';
// Usage: ./eevee.js [start, stop, restart, get, set, status, console, dump]

// TODO: implement logging more better - I really like how ee-log formats output but we need more functionality
// TODO: const consoleLogLevel = 'trace';

const log = require('ee-log');

log.highlight('Running with command line options:', process.argv);

// All the "<thing> the bot, duh" comments were suggested by tabnine so i'm keeping them.
switch (process.argv[2]) {
  case 'start':
    // Start the bot, duh
    // Make sure the bot isn't already running, validate any args, and fork off init.
    break;

  case 'stop':
    // Stop the bot, duh
    // If the bot is running, try to stop it gracefully.
    // If graceful stop fails, error out. If --force is passed, kill it with fire.
    break;

  case 'restart':
    // Restart the bot, duh
    // If the bot is running, try to gracefully stop it and then start it back up with the same args init ran with before.
    // If graceful stop fails, error out. If --force is passed, kill it with fire and start it back up.
    break;

  case 'config':
    // Configure the bot, duh
    switch (process.argv[3]) {
      case 'get':
        // Get the bot, duh
        // Get the value of a configuration entry from both startup and running config.
        break;

      case 'set':
        // Set the bot, duh
        // Set the value of a startup configuration entry.
        break;

      case 'tell':
        // Tell the bot, duh
        // Tell a running module to change a configuration entry.
        break;

      default:
        break;
    } // Can you tell I work with ceph?
    break;

  case 'status':
    // Status the bot, duh
    // If --json is passed, give json output.
    // Did you give me a module name to report the status of?
    if (process.argv[3] !== undefined) {
      // They gave us a module name.
      // If the module is running, ask it for a status report.
      // If not, print the last exit code, or something. Something like systemctl's output for a stopped service would be cool.
    } else {
      // If no module name was passed, gather up some useful stuff and print it to console.
      // Running modules, uptime, init args, etc.
    }
    break;

  case 'console':
    // Console the bot, duh
    // Enter an interactive shell to control the bot.
    break;

  case 'dump':
    // Dump the bot, duh
    // Ask all modules to dump their entire debug info to console.
    break;

  // Nothing in argv[2]
  case undefined:
    throw new Error('No command specified');

  // Something unexpected in argv[2]
  default:
    throw new Error('Invalid command specified');
}

// What are you doing here?
throw new Error("We shouldn't have reached this spot");
