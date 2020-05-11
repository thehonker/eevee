#!/usr/bin/env node
'use strict';

// Usage: eevee.js [init, start, stop, restart, config, status, console, dump]

const fs = require('fs');
const clog = require('ee-log');
const hjson = require('hjson');
const argv = require('yargs-parser')(process.argv.slice(2), {
  boolean: ['debug', 'verbose'],
});

var debug = true; // Set to true to override cli option --debug, set to false to respect --debug option
if (argv.debug) debug = true;

var verbose = true; // Set to true to override cli option --verbose, set to false to respect --verbose option
if (argv.verbose) verbose = true;
if (debug) verbose = true; // If debug is set to true then we'll turn on verbose as well

if (debug) clog.debug(argv);

const userFunctions = {
  // eslint-disable-next-line no-unused-vars
  init: (argv, cliConfig) => {},

  // eslint-disable-next-line no-unused-vars
  shutdown: (argv, cliConfig) => {},

  // eslint-disable-next-line no-unused-vars
  start: (argv, cliConfig) => {},

  // eslint-disable-next-line no-unused-vars
  stop: (argv, cliConfig) => {},

  // eslint-disable-next-line no-unused-vars
  restart: (argv, cliConfig) => {
    // Restart the module, duh
    // If the module is running, try to gracefully stop it and then start it back up with the same args init ran with before.
    // If graceful stop fails, error out. If --force is passed, kill it with fire and start it back up.
    userFunctions.stop(argv, cliConfig);
    userFunctions.start(argv, cliConfig);
  },

  // eslint-disable-next-line no-unused-vars
  config: (argv, cliConfig) => {
    // Configure the bot, duh
    switch (argv._[1]) {
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
    }
  },

  // eslint-disable-next-line no-unused-vars
  status: (argv, cliConfig) => {
    // Status the bot, duh
    // If --json is passed, give json output.
    // Did you give me a module name to report the status of?
    if (argv._[1] !== undefined) {
      // They gave us a module name.
      // If the module is running, ask it for a status report.
      // If not, print the last exit code, or something.
    } else {
      // If no module name was passed, gather up some useful stuff and print it to console.
      // Running modules, uptime, init args, etc.
    }
  },

  // eslint-disable-next-line no-unused-vars
  console: (argv, cliConfig) => {
    // Console the bot, duh
    // Enter an interactive shell to control the bot.
  },

  // eslint-disable-next-line no-unused-vars
  dump: (argv, cliConfig) => {
    // Dump the bot, duh
    // Ask all modules to dump their entire debug info to console.
  },
};

if (argv._[0] !== undefined) {
  if (typeof userFunctions[argv._[0]] === 'function') {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.readFile(`${__dirname}/etc/cli.hjson`, 'utf8', (err, data) => {
      if (err) throw new Error(err);
      // Load startup config
      const cliConfig = hjson.rt.parse(data);
      if (debug) clog.debug(cliConfig);
      process.exitCode = userFunctions[argv._[0]](argv, cliConfig);
    });
  } else {
    throw new Error('Invalid command');
  }
} else {
  // Treat no command as 'status'
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.readFile(`${__dirname}/etc/cli.hjson`, 'utf8', (err, data) => {
    if (err) throw new Error(err);
    // Load startup config
    const cliConfig = hjson.rt.parse(data);
    if (debug) clog.debug(cliConfig);
    process.exitCode = userFunctions['status'](argv, cliConfig);
  });
}
