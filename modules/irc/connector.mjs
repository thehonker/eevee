'use strict';

// Irc-connector. Talks to irc servers and passes messages over to irc-parser

const ident = 'irc-connector';
const debug = true;

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT, genMessageID } from '../../lib/common.mjs';

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
  if (process.send) process.send('ready');
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc);
});
