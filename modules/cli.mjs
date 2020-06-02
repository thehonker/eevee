#!/usr/bin/env node
'use strict';

// Usage: eevee [init, start, stop, restart, config, status, console, dump]

const ident = 'cli';
const debug = false;

import { default as clog } from 'ee-log';
import { default as yargs } from 'yargs';
import { default as AsciiTable } from 'ascii-table';
import { ipc, lockPidFile, exit, handleSIGINT, genMessageID } from '../lib/common.mjs';

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
  const messageID = genMessageID();
  const message = JSON.stringify({
    messageID: messageID,
    target: argv.module,
    notify: ident,
    action: 'start', // Not strictly required as we're going to publish to eevee-pm.request.start
  });
  if (debug) clog.debug('Sending start request:', message);
  ipc.publish('eevee-pm.request.start', message);
  ipc.subscribe(`${ident}.reply`, (data, info) => {
    data = JSON.parse(data);
    if (debug) clog.debug('Reply message: ', data, info);
    if (data.result === 'success' && data.messageID === messageID) {
      // eslint-disable-next-line prettier/prettier
        console.log(`Command: "start ${argv.module}" completed successfully (pid is ${data.childPID})`,);
      if (cb) cb(0);
      return 0;
    } else if (data.result === 'fail' && data.messageID === messageID) {
      var string = null;
      if (data.err.code === 'E_ALREADY_RUNNING') {
        string = `Command "start ${argv.module}" failed: ${data.err.code} (at ${data.err.path}).\n`;
        string += `Module already running? (pid ${data.childPID})`;
      } else {
        string = `Command "start ${argv.module}" failed: Unknown error:\n`;
        string += JSON.stringify(data.err, null, 2);
      }
      console.log(string);
      if (cb) cb(1);
      return 1;
    }
  });
}

function stop(argv, cb) {
  if (debug) clog.debug('Function stop() argv: ', argv);
  const messageID = genMessageID();
  const message = JSON.stringify({
    messageID: messageID,
    target: argv.module,
    notify: ident,
    action: 'stop',
  });
  if (debug) clog.debug('Sending stop request:', message);
  ipc.publish('eevee-pm.request.stop', message);
  ipc.subscribe(`${ident}.reply`, (data, info) => {
    data = JSON.parse(data);
    if (debug) clog.debug('Reply message: ', data, info);
    if (data.result === 'success' && data.messageID === messageID) {
      // eslint-disable-next-line prettier/prettier
        console.log(`Command: stop ${argv.module} completed successfully (pid was ${data.childPID})`);
      if (cb) cb(0);
      return 0;
    } else if (data.result === 'fail' && data.messageID === messageID) {
      var string = null;
      if (data.err.code === 'ENOENT') {
        string = `Command "stop ${argv.module}" failed: ${data.err.code} at ${data.err.path}. Module not running?`;
      } else {
        string = `Command "stop ${argv.module}" failed: Unknown error:\n`;
        string += JSON.stringify(data.err, null, 2);
      }
      console.log(string);
      if (cb) cb(1);
      return 1;
    }
  });
}

function status(argv, cb) {
  if (debug) clog.debug('Function status() argv: ', argv);
  const messageID = genMessageID();
  var message = null;
  if (argv.module) {
    message = JSON.stringify({
      messageID: messageID,
      target: argv.module,
      notify: ident,
      action: 'moduleStatus',
    });
    if (debug) clog.debug('Sending status request:', message);
    ipc.publish('eevee-pm.request.moduleStatus', message);
  } else {
    message = JSON.stringify({
      messageID: messageID,
      target: null,
      notify: ident,
      action: 'status',
    });
    ipc.publish('eevee-pm.request.status', message);
  }
  ipc.subscribe(`${ident}.reply`, (data, info) => {
    data = JSON.parse(data);
    if (debug) clog.debug('Reply message: ', data, info);
    if (data.result === 'success' && data.messageID === messageID) {
      if (data.command === 'moduleStatus') {
        // eslint-disable-next-line prettier/prettier
          console.log(`Command: "status ${argv.module}" completed successfully (pid is ${data.childPID})`);
        exit(ident);
      } else if (data.command === 'status') {
        console.log('Command: "status" completed successfully. Running modules:');

        const outputTable = new AsciiTable();
        outputTable.setHeading('Module Name', 'pid');
        data.childPID.forEach((child) => {
          outputTable.addRow(child.moduleName, child.pid);
        });
        console.log(outputTable.toString());

        if (cb) cb(0);
        return 0;
      }
    } else if (data.result === 'fail' && data.messageID === messageID) {
      var string = null;
      string = `Command "status ${argv.module}" failed: Unknown error:\n`;
      string += JSON.stringify(data.err, null, 2);
      console.log(string);
      if (cb) cb(1);
      return 1;
    }
  });
}
