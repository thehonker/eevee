'use strict';

// Process manager for eevee-bot

const ident = 'irc-test1';
const debug = true;

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT } from '../../lib/common.mjs';

lockPidFile(ident);

// Print every message we receive if debug is enabled
if (debug) {
  ipc.subscribe(`${ident}.#`, (data, info) => {
    clog.debug('incoming IPC message: ', info, data.toString());
  });
}

var foo = null;

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
  foo = setInterval(() => {
    clog.debug('sending ipc message');
    ipc.publish(
      'eevee-pm.info',
      JSON.stringify({
        message: 'hello',
        from: ident,
        currentTime: new Date().toUTCString(),
      }),
    );
  }, 1000);
});

process.on('SIGINT', () => {
  clearInterval(foo);
  handleSIGINT(ident, ipc);
});
