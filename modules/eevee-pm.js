'use strict';

// Process manager for eevee-bot

const ident = 'eevee-pm';
const debug = true;

// This checks and creates the dirs in /tmp if necessary
const procPath = require('../lib/common.js').createProcDir();

const QlobberFSQ = require('qlobber-fsq').QlobberFSQ;
const ipc = new QlobberFSQ({ fsq_dir: `${procPath}/ipc` });
const clog = require('ee-log');
const fs = require('fs');
const lock = require('lockfile');

lock.lock(`${procPath}/proc/${ident}.pid`, (err) => {
  if (err) throw new Error(`Unable to acquire lock ${procPath}/proc/${ident}.pid (Process already running?)`, err);
});
// eslint-disable-next-line security/detect-non-literal-fs-filename
fs.writeFileSync(`${procPath}/proc/${ident}.pid`, process.pid, 'utf8');

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
  lock.unlockSync(`${procPath}/proc/${ident}.pid`);
  process.exitCode = 0;
});
