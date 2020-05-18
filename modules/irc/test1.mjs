'use strict';

// Instance id test

const debug = true;

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT, genMessageID } from '../../lib/common.mjs';

var ident = 'irc-test1';
var instance = null;
var fullIdent = ident;

clog.debug(process.argv);

if (process.argv[2] === '--instance') {
  instance = process.argv[3];
  fullIdent = ident + '@' + instance;
}

lockPidFile(fullIdent);

// Print every message we receive if debug is enabled
if (debug) {
  ipc.subscribe(`${fullIdent}.#`, (data, info) => {
    clog.debug('incoming IPC message: ', info, data.toString());
  });
}

var foo = null;

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
  foo = setInterval(() => {
    const messageID = genMessageID();
    clog.debug('sending ipc message');
    ipc.publish(
      'eevee-pm.info',
      JSON.stringify({
        message: 'hello',
        messageID: messageID,
        from: ident,
        instance: instance,
        fullIdent: fullIdent,
        currentTime: new Date().toUTCString(),
      }),
    );
  }, 1000);
});

process.on('SIGINT', () => {
  clearInterval(foo);
  handleSIGINT(fullIdent, ipc);
});
