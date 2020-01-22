#!/usr/bin/env node
'use strict';

// Usage: eevee.js [init, start, stop, restart, config, status, console, dump]

const fs = require('fs');
const path = require('path');
const eelog = require('ee-log');
const pm2 = require('pm2');
const hjson = require('hjson');
const argv = require('yargs-parser')(process.argv.slice(2), {
  boolean: ['debug'],
});

var debug = true; // Set to true to override cli option --debug, set to false to respect --debug option
argv.debug ? (debug = true) : null;

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

const _throw = (err) => {
  log.error(err);
  throw new Error(err);
};

const userFunctions = {
  // eslint-disable-next-line no-unused-vars
  init: (argv, startupConfig) => {
    log.debug('init', argv);
    // Ask pm2 to start all modules listed in 'initModules'
    pm2.connect((err) => {
      log.debug('pm2 connected');
      err ? _throw(err) : null;
      startupConfig.initModules.forEach((ident) => {
        log.debug('attempting startup of', ident);
        pm2.start(path.join(__dirname, `/modules/${ident}.js`), (err) => {
          log.debug(ident, 'started');
          pm2.disconnect();
          err ? _throw(err) : null;
        });
      });
    });
  },

  // eslint-disable-next-line no-unused-vars
  shutdown: (argv, startupConfig) => {
    // Shutdown the bot
    log.debug('Shutdown args:', argv);
    pm2.connect((err) => {
      err ? _throw(err) : null;
      pm2.list((err, procList) => {
        procList.forEach((proc) => {
          pm2.delete(proc.name, (err) => {
            pm2.disconnect();
            err ? _throw(err) : null;
          });
        });
        pm2.killDaemon((err) => {
          pm2.disconnect();
          err ? _throw(err) : null;
        });
      });
    });
  },

  // eslint-disable-next-line no-unused-vars
  start: (argv, startupConfig) => {
    eelog.error(argv);
    var runningModules = [];
    const ident = argv._[1];
    pm2.connect((err) => {
      err ? _throw(err) : null;
      pm2.list((err, procList) => {
        procList.forEach((proc) => {
          runningModules.push(proc.name);
        });
        if (runningModules.includes(ident)) {
          _throw('Module already running');
        }
        eelog.error(ident);
        eelog.error('attempting startup of', ident);
        eelog.error('at', path.join(__dirname, `/modules/${ident}.js`));
        pm2.connect((err) => {
          err ? _throw(err) : null;
          pm2.start(path.join(__dirname, `/modules/${ident}.js`), (err) => {
            eelog.error(ident, 'started');
            pm2.disconnect();
            err ? _throw(err) : null;
          });
        });
        console.log('Running modules: ' + runningModules.join(', '));
        pm2.disconnect();
      });
      return 0;
    });
  },

  // eslint-disable-next-line no-unused-vars
  stop: (argv, startupConfig) => {
    // Stop a module
    // If the module is running, try to stop it gracefully.
    // If graceful stop fails, error out. If --force is passed, kill it with fire.
  },

  // eslint-disable-next-line no-unused-vars
  restart: (argv, startupConfig) => {
    // Restart the module, duh
    // If the module is running, try to gracefully stop it and then start it back up with the same args init ran with before.
    // If graceful stop fails, error out. If --force is passed, kill it with fire and start it back up.
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
    } // Can you tell I work with ceph?
  },

  // eslint-disable-next-line no-unused-vars
  status: (argv, startupConfig) => {
    // Status the bot, duh
    // If --json is passed, give json output.
    // Did you give me a module name to report the status of?
    if (argv[1] !== undefined) {
      // They gave us a module name.
      // If the module is running, ask it for a status report.
      // If not, print the last exit code, or something. Something like systemctl's output for a stopped service would be cool.
    } else {
      // If no module name was passed, gather up some useful stuff and print it to console.
      // Running modules, uptime, init args, etc.
      var runningModules = [];
      pm2.connect((err) => {
        err ? _throw(err) : null;
        pm2.list((err, procList) => {
          procList.forEach((proc) => {
            runningModules.push(proc.name);
          });
          pm2.disconnect();
          console.log('Running modules: ' + runningModules.join(', '));
        });
        return 0;
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

debug ? log.info(argv) : null;

if (argv._[0] !== undefined) {
  if (typeof userFunctions[argv._[0]] === 'function') {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.readFile(path.join(__dirname, '/etc/startup.hjson'), 'utf8', (err, data) => {
      err ? _throw(err) : null;
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
  fs.readFile(path.join(__dirname, '/etc/startup.hjson'), 'utf8', (err, data) => {
    err ? _throw(err) : null;
    // Load startup config
    const startupConfig = hjson.rt.parse(data);
    process.exitCode = userFunctions['status'](argv, startupConfig);
  });
}
