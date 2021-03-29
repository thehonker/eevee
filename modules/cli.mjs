#!/usr/bin/env node
'use strict';

// Usage: eevee [init, start, stop, restart, config, status, console, dump]

const ident = 'cli';
const debug = true;

import { default as clog } from 'ee-log';
import { default as yargs } from 'yargs';
import { default as AsciiTable } from 'ascii-table';
import { ipc, lockPidFile, exit, handleSIGINT, getConfig } from '../lib/common.mjs';
import { moduleStart, moduleStop, moduleStatus, botStatus, moduleStartPromise } from '../lib/eeveepm.mjs';

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

ipc.subscribe(`${ident}.ping`, (data) => {
  const pingRequest = JSON.parse(data);
  if (debug) clog.debug('Ping request received:', pingRequest);
  const pingReply = {
    requestId: pingRequest.requestId,
    ident: ident,
    pid: process.pid,
    status: 'running',
  };
  if (debug) clog.debug(`Sending reply to: ${pingRequest.replyTo}`, pingReply);
  ipc.publish(pingRequest.replyTo, JSON.stringify(pingReply));
});

// Once the ipc has "connected", start parsing args
ipc.on('start', () => {
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
      handler: (argv) => {
        start(argv, (exitCode) => {
          exit(ident, exitCode);
        });
      },
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

function start(argv, cb) {
  if (debug) clog.debug('Function start() argv: ', argv);
  const request = {
    target: argv.module,
    action: 'start', // Not strictly required as we're going to publish to eevee-pm.request.start
  };
  moduleStart(request, (result) => {
    if (result.result === 'success') {
      // eslint-disable-next-line prettier/prettier
      console.log(`Command: "start ${argv.module}" completed successfully (pid is ${result.childPID})`,);
      if (cb) cb(0);
      return 0;
    } else if (result.result === 'fail') {
      let string = null;
      if (result.err.code === 'E_ALREADY_RUNNING') {
        string = `Command "start ${argv.module}" failed: ${result.err.code} (at ${result.err.path}).\n`;
        string += `Module already running? (pid ${result.childPID})`;
      } else {
        string = `Command "start ${argv.module}" failed: Unknown error:\n`;
        string += JSON.stringify(result.err, null, 2);
      }
      console.log(string);
      if (cb) cb(1);
      return 1;
    }
  });
}

function startPromise(argv) {
  moduleStartPromise(argv.module)
    .then((result) => {
      return;
    })
    .catch((err) => {
      clog.debug(err);
      exit(ident, 0);
      return 0;
    });
}

function stop(argv, cb) {
  if (debug) clog.debug('Function stop() argv: ', argv);
  const request = {
    target: argv.module,
    action: 'stop',
  };
  moduleStop(request, (result) => {
    if (result.result === 'success') {
      // eslint-disable-next-line prettier/prettier
      console.log(`Command: "stop  ${argv.module}" completed successfully (pid was ${result.childPID})`);
      if (cb) cb(0);
      return 0;
    } else if (result.result === 'fail') {
      var string = null;
      if (result.err.code === 'ENOENT') {
        string = `Command "stop ${argv.module}" failed: ${result.err.code} at ${result.err.path}. Module not running?`;
      } else {
        string = `Command "stop ${argv.module}" failed: Unknown error:\n`;
        string += JSON.stringify(result.err, null, 2);
      }
      console.log(string);
      if (cb) cb(1);
      return 1;
    }
  });
}

function status(argv) {
  if (debug) clog.debug('Function status() argv: ', argv);
  if (argv.module) {
    moduleStatus(ipc, argv.module)
      .then((moduleStatus) => {
        console.log(`Command: "status ${argv.module}" completed successfully. Module information:`);
        console.log(`Ident:           ${moduleStatus.ident}`);
        console.log(`PID:             ${moduleStatus.pid}`);
        console.log(`Status:          ${moduleStatus.status}`);
        console.log(`PID File Status: ${moduleStatus.pidFileStatus}`);
        exit(ident, 0);
        return 0;
      })
      .catch((err) => {
        clog.debug(err);
        exit(ident, 0);
        return 0;
      });
  } else {
    botStatus(ipc)
      .then((modules) => {
        if (debug) clog.debug(modules);
        console.log('Command: "status" completed successfully. Running modules:');
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
        exit(ident, 0);
        return 0;
      })
      .catch((err) => {
        clog.debug(err);
        exit(ident, 0);
        return 0;
      });
  }
}

function init(argv, cb) {
  if (debug) clog.debug('Function init() argv: ', argv);
  // Get list of modules to start from init config
  const config = getConfig('init');
  if (debug) clog.debug(config);

  config.initModules.forEach((module) => {
    const request = {
      module: module,
    };
    clog.debug(request);
    start(request, (result) => {
      if (debug) clog.debug(result);
    });
  });
  if (cb) cb(0);
  return 0;
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
      modules.forEach((module) => {
        const request = {
          module: module.ident,
        };
        clog.debug(request);
        stop(request, (result) => {
          if (debug) clog.debug(result);
        });
      });
      exit(ident, 0);
      return 0;
    })
    .catch((err) => {
      clog.debug(err);
      exit(ident, 0);
      return 0;
    });
}
