'use strict';

// Process manager for eevee-bot

const ident = 'test2';
const debug = false;

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
  ipc.subscribe('test2.recv', (data) => {
    console.log(`Message from ${data.from}: ${data.message} (Message ID: ${data.messageID})`);
    console.log(`Message was sent at ${data.currentTime} and received at ${new Date().toUTCString()}`);
  });
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc, debug);
});
