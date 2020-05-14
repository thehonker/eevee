#!/usr/bin/env node
'use strict';

// Usage: eevee [init, start, stop, restart, config, status, console, dump]

const ident = 'cli';
const debug = true;

import { default as clog } from 'ee-log';
import { default as yargs } from 'yargs';
import { ipc, lockPidFile, handleSIGINT, genMessageID } from '../lib/common.mjs';

const args = yargs
  .usage('Usage: $0 [command] [options]')
  .command({
    command: ['status [module]', '$0'],
    desc: 'Show bot or module status',
    handler: (args) => {
      clog.debug('argv: ', args);
    },
  })
  .command({
    command: ['start <module>'],
    desc: 'Ask eevee-pm to start a module',
    builder: (yargs) => {
      yargs.default('force', 'false');
    },
    handler: (args) => {
      clog.debug('argv: ', args);
      ipc.on('start', () => {
        if (debug) clog.debug('IPC "connected"');
        const messageID = genMessageID();
        clog.debug('Sending start request');
        const message = JSON.stringify({
          messageID: messageID,
          target: args.module,
          notify: ident,
          action: 'start',
          force: args.force,
        });
        ipc.publish('eevee-pm.request', message);
        ipc.subscribe(`${ident}.reply`, (data, info) => {
          data = JSON.parse(data);
          clog.debug('Reply message: ', data, info);
          if (data.result === 'success' && data.messageID === messageID) handleSIGINT(ident, ipc);
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
    handler: (args) => {
      clog.debug('argv: ', args);
      ipc.on('start', () => {
        if (debug) clog.debug('IPC "connected"');
        const messageID = genMessageID();
        clog.debug('Sending stop request');
        const message = JSON.stringify({
          messageID: messageID,
          target: args.module,
          notify: ident,
          action: 'stop',
          force: args.force,
        });
        ipc.publish('eevee-pm.request', message);
        ipc.subscribe(`${ident}.reply`, (data, info) => {
          data = JSON.parse(data);
          clog.debug('Reply message: ', data, info);
          if (data.result === 'success' && data.messageID === messageID) handleSIGINT(ident, ipc);
        });
      });
    },
  })
  .help().argv;

clog.debug('argv outside yargs, argv: ', args);

// Create and lock a pid file at /tmp/eevee/proc/eevee-pm.pid
lockPidFile(ident);

// Print every message we receive if debug is enabled
if (debug) {
  ipc.subscribe(`${ident}.#`, (data, info) => {
    clog.debug('Incoming IPC message: ', data.toString(), info);
  });
}

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc);
});
