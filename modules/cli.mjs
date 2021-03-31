#!/usr/bin/env node
'use strict';

// Usage: eevee [init, start, stop, restart, config, status, console, dump]

const ident = 'cli';
const debug = false;

import { default as clog } from 'ee-log';
import { default as yargs } from 'yargs';
import { default as AsciiTable } from 'ascii-table';
import { ipc, lockPidFile, exit, handleSIGINT, getConfig, setPingListener } from '../lib/common.mjs';
import { moduleStart, moduleStop, moduleStatus, botStatus } from '../lib/eeveepm.mjs';

// Create and lock a pid file at /tmp/eevee/proc/eevee-pm.pid
lockPidFile(ident);

if (debug) {
  ipc.on('start', () => {
    clog.debug('IPC "connected"');
    // Print every message we receive if debug is enabled
    ipc.subscribe(`${ident}.#`, (data, info) => {
      clog.debug('Incoming IPC message: ', JSON.stringify(JSON.parse(data.toString()), null, 2), info);
    });
  });
}

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc, debug);
});

setPingListener(ipc, ident, 'init');

// Once the ipc has "connected", start parsing args
ipc.on('start', () => {
  setPingListener(ipc, ident, 'running');
  const argv = yargs
    .usage('Usage: $0 <command> [options]')
    // Show module or bot status
    .command({
      command: 'status [module]',
      desc: 'Show bot or module status',
      handler: status,
    })
    // Start a module
    .command({
      command: 'start <module>',
      desc: 'Ask eevee-pm to start a module',
      builder: (yargs) => {
        yargs.positional('module', {
          describe: 'The module to start',
          type: 'string',
        });
      },
      handler: start,
    })
    // Stop a module
    .command({
      command: 'stop <module>',
      desc: 'Ask eevee-pm to stop a module',
      builder: (yargs) => {
        yargs.positional('module', {
          describe: 'The module to stop',
          type: 'string',
        });
      },
      handler: (argv) => {
        stop(argv, (exitCode) => {
          exit(ident, exitCode);
        });
      },
    })
    // Restart a module
    .command({
      command: 'restart <module>',
      desc: 'Ask eevee-pm to restart a module',
      builder: (yargs) => {
        yargs.positional('module', {
          describe: 'The module to restart',
          type: 'string',
        });
      },
      handler: (argv) => {
        stop(argv, (stopCode) => {
          setTimeout(() => {
            start(argv, (startCode) => {
              exit(ident, stopCode + startCode);
            });
          }, 500);
        });
      },
    })
    // Start the entire bot
    .command({
      command: 'init',
      desc: 'Cold-start the bot',
      handler: (argv) => {
        init(argv, (initCode) => {
          exit(ident, initCode + initCode);
        });
      },
    })
    // Shutdown the entire bot
    .command({
      command: 'shutdown',
      desc: 'Shutdown the bot',
      handler: shutdown,
    })
    .showHelpOnFail(true)
    .demandCommand(1, '')
    .strict()
    .help().argv;

  if (debug) clog.debug('argv as parsed by yargs:', argv);
});

function start(argv) {
  moduleStart(ipc, argv.module)
    .then((result) => {
      if (debug) clog.debug(result);
      console.log(`Command "start ${result.ident}" completed successfully. (pid is ${result.pid})`);
      exit(ident, 0);
      return 0;
    })
    .catch((err) => {
      clog.error(err.code, err.message);
      exit(ident, 1);
      return 1;
    });
}

function stop(argv) {
  if (debug) clog.debug('Function start() argv: ', argv);
  if (argv.module) {
    moduleStop(ipc, argv.module)
      .then((result) => {
        if (debug) clog.debug(result);
        console.log(`Command "stop ${result.ident}" completed successfully. (pid was ${result.pid})`);
        exit(ident, 0);
        return 0;
      })
      .catch((err) => {
        clog.error(err.code, err.message);
        exit(ident, 1);
        return 1;
      });
  }
}

function status(argv) {
  if (debug) clog.debug('Function status() argv: ', argv);
  if (argv.module) {
    moduleStatus(ipc, argv.module)
      .then((moduleStatus) => {
        console.log(`Command: "status ${argv.module}" completed successfully. Module information:`);
        const outputTable = new AsciiTable();
        outputTable.setHeading('module name', 'status', 'pid', 'pid file');
        outputTable.addRow(moduleStatus.ident, moduleStatus.status, moduleStatus.pid, moduleStatus.pidFileStatus);
        console.log(outputTable.toString());
        exit(ident, 0);
        return 0;
      })
      .catch((err) => {
        clog.error(err);
        exit(ident, 1);
        return 1;
      });
  } else {
    botStatus(ipc)
      .then((modules) => {
        if (debug) clog.debug(modules);
        console.log('Command: "status" completed successfully. Running modules:');
        const outputTable = new AsciiTable();
        outputTable.setHeading('module name', 'status', 'pid', 'pid file');
        modules.forEach((module) => {
          if (module.pid === process.pid) {
            outputTable.addRow(`${module.ident} (this instance)`, module.status, module.pid, module.pidFileStatus);
          } else {
            outputTable.addRow(module.ident, module.status, module.pid, module.pidFileStatus);
          }
        });
        console.log(outputTable.toString());
        exit(ident, 0);
        return 0;
      })
      .catch((err) => {
        clog.error(err);
        exit(ident, 1);
        return 1;
      });
  }
}

function init(argv) {
  if (debug) clog.debug('Function init() argv: ', argv);
  // Get list of modules to start from init config
  const config = getConfig('init');
  if (debug) clog.debug(config);
  console.log('Starting the following modules:');
  console.log(config.initModules);

  var runningModules = [];
  config.initModules.forEach((module) => {
    moduleStart(ipc, module)
      .then((result) => {
        if (debug) clog.debug(result);
        console.log(`Command "start ${result.ident}" completed successfully. (pid is ${result.pid})`);
        runningModules.push(result);
        if (runningModules.length === config.initModules.length) {
          exit(ident, 0);
          return 0;
        }
        return;
      })
      .catch((err) => {
        clog.error(err.code, err.message);
        exit(ident, 1);
        return 1;
      });
  });
}

function shutdown(argv) {
  if (debug) clog.debug('Function shutdown() argv: ', argv);
  botStatus(ipc)
    .then((modules) => {
      if (debug) clog.debug(modules);
      console.log('Command: "shutdown" initiated successfully. Running modules:');
      const outputTable = new AsciiTable();
      outputTable.setHeading('module name', 'pid', 'pid file status');
      modules.forEach((module) => {
        if (module.pid === process.pid) {
          outputTable.addRow(`${module.ident} (this instance)`, module.pid, module.pidFileStatus);
        } else {
          outputTable.addRow(module.ident, module.pid, module.pidFileStatus);
        }
      });
      console.log(outputTable.toString());
      var stoppedModules = [];
      modules.forEach((module) => {
        if (module.ident != 'cli') {
          // eslint-disable-next-line promise/no-nesting
          moduleStop(ipc, module.ident)
            .then((result) => {
              if (debug) clog.debug(result);
              console.log(`Command "stop ${result.ident}" completed successfully. (pid was ${result.pid})`);
              stoppedModules.push(module);
              if (stoppedModules.length === modules.length) {
                exit(ident, 0);
                return 0;
              }
              return 0;
            })
            .catch((err) => {
              clog.error(err.code, err.message);
              exit(ident, 1);
              return 1;
            });
        }
      });
      return;
    })
    .catch((err) => {
      clog.debug(err);
      exit(ident, 1);
      return 1;
    });
}
