'use strict';

// Process manager for eevee-bot

const ident = 'test1';
const debug = true;

const common = require('../lib/common.js');

// This checks and creates the dirs in /tmp if necessary
const procPath = common.createProcDir();
const ipc = common.ipc();
const lock = common.lock(ident);

const clog = require('ee-log');

// Print every message we receive if debug is enabled
if (debug) {
  ipc.subscribe(`${ident}.#`, (data, info) => {
    clog.debug('incoming IPC message: ', info.toString('utf8'), data.toString('utf8'));
  });
}

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
});

const foo = setInterval(() => {
  clog.debug('sending ipc message');
  ipc.publish('eevee-pm.info', 'hello');
}, 500);

// Handle sigint
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, cleaning up... (repeat to force)');
  process.removeAllListeners('SIGINT');
  process.on('SIGINT', () => {
    throw new Error('Received SIGINT twice, forcing exit.');
  });
  ipc.unsubscribe();
  ipc.stop_watching();
  ipc.removeAllListeners();
  clearInterval(foo);
  lock.unlockSync(`${procPath}/proc/${ident}.pid`);
  process.exitCode = 0;
});
