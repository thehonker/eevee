#!/usr/bin/env node
'use strict';

// Usage: eevee [init, start, stop, restart, config, status, console, dump]

const ident = 'cli';
const debug = false;

import { default as clog } from 'ee-log';
import { default as yargs } from 'yargs';
import { default as AsciiTable } from 'ascii-table';
import { ipc, lockPidFile, exit, handleSIGINT } from '../lib/common.mjs';
import { start as moduleStart, stop as moduleStop, moduleStatus, status as botStatus } from '../lib/eeveepm.mjs';

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

ipc.on('start', () => {
  const argv = yargs
    .usage('Usage: $0 <command> [options]')
    .command({
      command: 'status [module]',
      desc: 'Show bot or module status',
      handler: (argv) => {
        status(argv, (exitCode) => {
          exit(ident, exitCode);
        });
      },
    })
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
          start(argv, (startCode) => {
            exit(ident, stopCode + startCode);
          });
        });
      },
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

function stop(argv, cb) {
  if (debug) clog.debug('Function stop() argv: ', argv);
  const request = {
    target: argv.module,
    action: 'stop',
  };
  moduleStop(request, (result) => {
    if (result.result === 'success') {
      // eslint-disable-next-line prettier/prettier
    console.log(`Command: stop ${argv.module} completed successfully (pid was ${result.childPID})`);
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

function status(argv, cb) {
  if (debug) clog.debug('Function status() argv: ', argv);
  var request = null;
  if (argv.module) {
    request = {
      target: argv.module,
      action: 'moduleStatus',
    };
    moduleStatus(request, (result) => {
      if (result.result === 'success') {
        console.log(`Command: "status ${argv.module}" completed successfully (pid is ${result.childPID})`);
        if (cb) cb(0);
        return 0;
      } else if (result.result === 'fail') {
        var string = null;
        string = `Command "status ${argv.module}" failed: Unknown error:\n`;
        string += JSON.stringify(result.err, null, 2);
        console.log(string);
        if (cb) cb(1);
        return 1;
      }
    });
  } else {
    request = {
      target: null,
      action: 'status',
    };
    botStatus(request, (result) => {
      console.log('Command: "status" completed successfully. Running modules:');
      const outputTable = new AsciiTable();
      outputTable.setHeading('Module Name', 'pid');
      result.childPID.forEach((child) => {
        if (child.pid === process.pid) {
          outputTable.addRow(`${child.moduleName} (this instance)`, child.pid);
        } else {
          outputTable.addRow(child.moduleName, child.pid);
        }
      });
      console.log(outputTable.toString());
      if (cb) cb(0);
      return 0;
    });
  }
}
