'use strict';
// Usage: ./eevee.js [init, start, stop, restart, config, status, console, dump]

// TODO: implement logging more better - I really like how ee-log formats output but we need more functionality

const debug = true;

const fs = require('fs');
const eelog = require('ee-log');
const pm2 = require('pm2');
const hjson = require('hjson');

// We'll make this better in the future I guess
// prettier-ignore
const log = {
  debug: (args) => { debug ? eelog.debug(args) : null; },
  info: (args) => { debug ? eelog.highlight(args) : null; },
  notice: (args) => { debug ? eelog.success(args) : null; },
  warn: (args) => { debug ? eelog.warn(args) : null; },
  error: (args) => { debug ? eelog.error(args) : null; },
  crit: (args) => { debug ? eelog.error(args) : null; },
  alert: (args) => { debug ? eelog.error(args) : null; },
  emergency: (args) => { debug ? eelog.error(args) : null; },
}

const userFunctions = {
  init: (args) => {
    log.debug('Init args:', args);

    // Load startup config
    const startupConfigString = fs.readFileSync('./etc/startup.hjson', 'utf8');
    const startupConfig = hjson.rt.parse(startupConfigString);
    log.debug('Startup config:', startupConfig);

    // Ask pm2 to start them all up
    pm2.connect((error) => {
      if (error) {
        log.error(error);
        throw error;
      }
      pm2.start({
        script: './modules/helloworld.js',
        autorestart: false,
      });
    });
    pm2.disconnect();
  },

  // eslint-disable-next-line no-unused-vars
  shutdown: (args) => {
    // Shutdown the bot
    log.debug('Shutdown args:', args);
  },

  // eslint-disable-next-line no-unused-vars
  start: (args) => {
    log.debug('Start command:', args);
    // Start a module
    // Make sure the module isn't already running, validate any args.
  },

  // eslint-disable-next-line no-unused-vars
  stop: (args) => {
    // Stop a module
    // If the module is running, try to stop it gracefully.
    // If graceful stop fails, error out. If --force is passed, kill it with fire.
  },

  // eslint-disable-next-line no-unused-vars
  restart: (args) => {
    // Restart the module, duh
    // If the module is running, try to gracefully stop it and then start it back up with the same args init ran with before.
    // If graceful stop fails, error out. If --force is passed, kill it with fire and start it back up.
  },

  // eslint-disable-next-line no-unused-vars
  config: (args) => {
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
  status: (args) => {
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
  console: (args) => {
    // Console the bot, duh
    // Enter an interactive shell to control the bot.
    pm2.connect((error) => {
      if (error) {
        log.error(error);
        throw error;
      }
      pm2.list();
    });
    pm2.disconnect();
  },

  // eslint-disable-next-line no-unused-vars
  dump: (args) => {
    // Dump the bot, duh
    // Ask all modules to dump their entire debug info to console.
  },
};

log.info('Running with command line options:', process.argv);

if (process.argv[2] !== undefined) {
  if (typeof userFunctions[process.argv[2]] === 'function') {
    process.exitCode = userFunctions[process.argv[2]](process.argv.slice(3));
  } else {
    throw new Error('Invalid command');
  }
} else {
  throw new Error('No command given');
}
