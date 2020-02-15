#!/usr/bin/env node
'use strict';

// Usage: eevee.js [init, start, stop, restart, config, status, console, dump]

process.env.PM2_HOME = `${__dirname}/proc`;

const fs = require('fs');
const clog = require('ee-log');
const pm2 = require('pm2');
const hjson = require('hjson');
const argv = require('yargs-parser')(process.argv.slice(2), {
  boolean: ['debug', 'verbose'],
});

var debug = true; // Set to true to override cli option --debug, set to false to respect --debug option
if (argv.debug) debug = true;

var verbose = true; // Set to true to override cli option --verbose, set to false to respect --verbose option
if (argv.verbose) verbose = true;
if (debug) verbose = true; // If debug is set to true then we'll turn on verbose as well

const userFunctions = {
  // eslint-disable-next-line no-unused-vars
  init: (argv, startupConfig) => {
    // Ask pm2 to start all modules listed in 'initModules'
    pm2.list((err, procList) => {
      if (err) throw new Error(err);
      const runningModules = [];
      procList.forEach((proc) => {
        runningModules.push(proc.name);
      });
      if (verbose) console.log('Startup modules:' + runningModules);
      startupConfig.initModules.forEach((ident) => {
        if (runningModules.includes(ident)) throw new Error('Module already running');
        fs.access(`${__dirname}/modules/${ident}.js`, (err) => {
          if (err) throw new Error(err);
          pm2.start(`${__dirname}/modules/${ident}.js`, (err) => {
            if (err) throw new Error(err);
            if (verbose) console.log(`Module ${ident} started`);
            pm2.disconnect();
          });
        });
      });
      pm2.disconnect();
    });
  },

  // eslint-disable-next-line no-unused-vars
  shutdown: (argv, startupConfig) => {
    // Shutdown the bot
    pm2.list((err, procList) => {
      if (debug) clog.debug(procList);
      if (procList.length === 0) throw new Error('No processes running');
      procList.forEach((proc) => {
        pm2.delete(proc.name, (err) => {
          if (err) throw new Error(err);
          if (debug) clog.debug(proc.name, 'stopped');
          pm2.disconnect();
        });
      });
    });
  },

  // eslint-disable-next-line no-unused-vars
  start: (argv, startupConfig) => {
    var runningModules = [];
    const ident = argv._[1];
    pm2.list((err, procList) => {
      if (err) throw new Error(err);
      procList.forEach((proc) => {
        runningModules.push(proc.name);
      });
      if (runningModules.includes(ident)) throw new Error('Module already running');
      fs.access(`${__dirname}/modules/${ident}.js`, (err) => {
        if (err) throw new Error(err);
        pm2.start(`${__dirname}/modules/${ident}.js`, (err) => {
          if (err) throw new Error(err);
          if (debug) clog.debug(ident, 'started');
          pm2.disconnect();
        });
      });
    });
  },

  // eslint-disable-next-line no-unused-vars
  stop: (argv, startupConfig) => {
    var runningModules = [];
    const ident = argv._[1];
    pm2.list((err, procList) => {
      if (err) throw new Error(err);
      procList.forEach((proc) => {
        runningModules.push(proc.name);
      });
      if (!runningModules.includes(ident)) throw new Error('Module not running');
      pm2.delete(ident, (err) => {
        if (err) throw new Error(err);
        if (debug) clog.debug(ident, 'stopped');
        pm2.disconnect();
      });
    });
  },

  // eslint-disable-next-line no-unused-vars
  restart: (argv, startupConfig) => {
    // Restart the module, duh
    // If the module is running, try to gracefully stop it and then start it back up with the same args init ran with before.
    // If graceful stop fails, error out. If --force is passed, kill it with fire and start it back up.
    userFunctions.stop(argv, startupConfig);
    userFunctions.start(argv, startupConfig);
  },

  // eslint-disable-next-line no-unused-vars
  config: (argv, startupConfig) => {
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
  status: (argv, startupConfig) => {
    // Status the bot, duh
    // If --json is passed, give json output.
    // Did you give me a module name to report the status of?
    if (argv._[1] !== undefined) {
      // They gave us a module name.
      // If the module is running, ask it for a status report.
      // If not, print the last exit code, or something.
      pm2.disconnect();
    } else {
      // If no module name was passed, gather up some useful stuff and print it to console.
      // Running modules, uptime, init args, etc.
      var runningModules = [];
      pm2.list((err, procList) => {
        if (err) throw new Error(err);
        procList.forEach((proc) => {
          runningModules.push(proc.name);
        });
        pm2.disconnect();
        console.log('Running modules: ' + runningModules.join(', '));
      });
    }
  },

  // eslint-disable-next-line no-unused-vars
  console: (argv, startupConfig) => {
    // Console the bot, duh
    // Enter an interactive shell to control the bot.
  },

  // eslint-disable-next-line no-unused-vars
  dump: (argv, startupConfig) => {
    // Dump the bot, duh
    // Ask all modules to dump their entire debug info to console.
  },
};

if (debug) clog.debug(argv);

if (argv._[0] !== undefined) {
  if (typeof userFunctions[argv._[0]] === 'function') {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.readFile(`${__dirname}/etc/startup.hjson`, 'utf8', (err, data) => {
      if (err) throw new Error(err);
      // Load startup config
      const startupConfig = hjson.rt.parse(data);
      process.exitCode = userFunctions[argv._[0]](argv, startupConfig);
    });
  } else {
    throw new Error('Invalid command');
  }
} else {
  // Treat no command as 'status'
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.readFile(`${__dirname}/etc/startup.hjson`, 'utf8', (err, data) => {
    if (err) throw new Error(err);
    // Load startup config
    const startupConfig = hjson.rt.parse(data);
    process.exitCode = userFunctions['status'](argv, startupConfig);
  });
}
