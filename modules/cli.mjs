#!/usr/bin/env node
'use strict';

// Usage: eevee [init, start, stop, restart, config, status, console, dump]

const ident = 'cli';
const debug = true;

import { default as clog } from 'ee-log';
import { default as yargs } from 'yargs';
import { ipc, lockPidFile, exit, handleSIGINT, genMessageID } from '../lib/common.mjs';

const argv = yargs
  .usage('Usage: $0 [command] [options]')
  .command({
    command: ['status [module]', '$0'],
    desc: 'Show bot or module status',
    handler: (argv) => {
      clog.debug('argv: ', argv);
    },
  })
  .command({
    command: ['start <module>'],
    desc: 'Ask eevee-pm to start a module',
    builder: (yargs) => {
      yargs.default('force', 'false');
    },
    handler: (argv) => {
      clog.debug('argv: ', argv);
      ipc.on('start', () => {
        if (debug) clog.debug('IPC "connected"');
        const messageID = genMessageID();
        clog.debug('Sending start request');
        const message = JSON.stringify({
          messageID: messageID,
          target: argv.module,
          notify: ident,
          action: 'start',
          force: argv.force,
        });
        ipc.publish('eevee-pm.request', message);
        ipc.subscribe(`${ident}.reply`, (data, info) => {
          data = JSON.parse(data);
          clog.debug('Reply message: ', data, info);
          if (data.result === 'success' && data.messageID === messageID) {
            // eslint-disable-next-line prettier/prettier
          console.log(`Command: "start ${argv.module}" completed successfully (pid is ${data.childPID})`,);
            exit(ident);
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
            exit(ident, 1);
          }
        });
      });
    },
  })
  .command({
    command: ['stop <module>'],
    desc: 'Ask eevee-pm to stop a module',
    builder: (yargs) => {
      yargs.default('force', 'false');
    },
    handler: (argv) => {
      clog.debug('argv: ', argv);
      ipc.on('start', () => {
        if (debug) clog.debug('IPC "connected"');
        const messageID = genMessageID();
        clog.debug('Sending stop request');
        const message = JSON.stringify({
          messageID: messageID,
          target: argv.module,
          notify: ident,
          action: 'stop',
          force: argv.force,
        });
        ipc.publish('eevee-pm.request', message);
        ipc.subscribe(`${ident}.reply`, (data, info) => {
          data = JSON.parse(data);
          clog.debug('Reply message: ', data, info);
          if (data.result === 'success' && data.messageID === messageID) {
            // eslint-disable-next-line prettier/prettier
          console.log(`Command: stop ${argv.module} completed successfully (pid was ${data.childPID})`);
            exit(ident);
          } else if (data.result === 'fail' && data.messageID === messageID) {
            var string = null;
            if (data.err.code === 'ENOENT') {
              string = `Command "stop ${argv.module}" failed: ${data.err.code} at ${data.err.path}. Module not running?`;
            } else {
              string = `Command "stop ${argv.module}" failed: Unknown error:\n`;
              string += JSON.stringify(data.err, null, 2);
            }
            console.log(string);
            exit(ident, 1);
          }
        });
      });
    },
  })
  .help().argv;

// Create and lock a pid file at /tmp/eevee/proc/eevee-pm.pid
lockPidFile(ident);

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  // Print every message we receive if debug is enabled
  if (debug) {
    ipc.subscribe(`${ident}.#`, (data, info) => {
      clog.debug('Incoming IPC message: ', JSON.stringify(JSON.parse(data.toString()), null, 2), info);
    });
  }
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc);
});
