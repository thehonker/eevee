'use strict';
// Usage: ./eevee.js [init, start, stop, restart, config, status, console, dump]

// TODO: implement logging more better - I really like how ee-log formats output but we need more functionality
// TODO: const consoleLogLevel = 'trace';
const fs = require('fs');
const clog = require('ee-log');
const pm2 = require('pm2');
const hjson = require('hjson');

const userFunctions = {
  init: function(args) {
    clog.highlight('Init args:', args);

    // Load startup config
    const startupConfigString = fs.readFileSync('./etc/startup.hjson', 'utf8');
    const startupConfig = hjson.rt.parse(startupConfigString);
    clog.highlight('Startup config:', startupConfig);

    // Ask pm2 to start them all up
    pm2.connect((error) => {
      if (error) {
        clog.error(error);
        throw error;
      }
      pm2.start({
        script: './modules/helloworld.js',
        autorestart: false,
      });
      clog.highlight('pm2.list');
      clog.highlight(pm2.list());
    });
    pm2.disconnect();
  },

  // eslint-disable-next-line no-unused-vars
  shutdown: function(args) {
    // Shutdown the bot
  },

  // eslint-disable-next-line no-unused-vars
  start: function(args) {
    clog.highlight('Start command:', args);
    // Start a module
    // Make sure the module isn't already running, validate any args.
  },

  // eslint-disable-next-line no-unused-vars
  stop: function(args) {
    // Stop a module
    // If the module is running, try to stop it gracefully.
    // If graceful stop fails, error out. If --force is passed, kill it with fire.
  },

  // eslint-disable-next-line no-unused-vars
  restart: function(args) {
    // Restart the module, duh
    // If the module is running, try to gracefully stop it and then start it back up with the same args init ran with before.
    // If graceful stop fails, error out. If --force is passed, kill it with fire and start it back up.
  },

  // eslint-disable-next-line no-unused-vars
  config: function(args) {
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
  },

  // eslint-disable-next-line no-unused-vars
  status: function(args) {
    // Status the bot, duh
    // If --json is passed, give json output.
    // Did you give me a module name to report the status of?
    if (args[3] !== undefined) {
      // They gave us a module name.
      // If the module is running, ask it for a status report.
      // If not, print the last exit code, or something. Something like systemctl's output for a stopped service would be cool.
    } else {
      // If no module name was passed, gather up some useful stuff and print it to console.
      // Running modules, uptime, init args, etc.
    }
  },

  // eslint-disable-next-line no-unused-vars
  console: function(args) {
    // Console the bot, duh
    // Enter an interactive shell to control the bot.
  },

  // eslint-disable-next-line no-unused-vars
  dump: function(args) {
    // Dump the bot, duh
    // Ask all modules to dump their entire debug info to console.
  },
};

clog.highlight('Running with command line options:', process.argv);

if (process.argv[2] !== undefined) {
  if (typeof userFunctions[process.argv[2]] === 'function') {
    process.exitCode = userFunctions[process.argv[2]](process.argv.slice(3));
  } else {
    throw new Error('Invalid command');
  }
} else {
  throw new Error('No command given');
}
