'use strict';

// Process manager for eevee-bot

const ident = 'eevee-pm';
const debug = true;

import { default as clog } from 'ee-log';

import { ipc, handleSIGINT, lockPidFile } from '../lib/common.mjs';

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
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc);
});
