'use strict';

// Process manager for eevee-bot

const ident = 'test2';
const debug = true;

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT } from '../lib/common.mjs';

lockPidFile(ident);

// Print every message we receive if debug is enabled
if (debug) {
  ipc.subscribe(`${ident}.#`, (data, info) => {
    clog.debug('incoming IPC message: ', info, data.toString());
  });
}

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  clog.debug('Sending stop request');
  const message = JSON.stringify({
    target: 'test1',
    replyTo: 'test2',
  });
  ipc.publish('eevee-pm.request.stop', message);
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc);
});
