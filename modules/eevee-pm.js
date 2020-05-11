'use strict';

// Process manager for eevee-bot

const ident = 'eevee-pm';
const debug = true;

const QlobberFSQ = require('qlobber-fsq').QlobberFSQ;
const ipc = new QlobberFSQ({ fsq_dir: '/tmp/eevee/ipc' });
const clog = require('ee-log');
const fs = require('fs');
const lock = require('lockfile');

const common = require('../lib/common.js');

common.tmpDirTest();

lock.lock(`/tmp/eevee/proc/${ident}.pid`, (err) => {
  if (err) throw new Error(err);
  fs.writeFile(`/tmp/eevee/proc/${ident}.pid`, process.pid, 'utf8', (err) => {
    if (err) throw new Error(err);
  });
});

if (debug) {
  ipc.subscribe(`${ident}.#`, (data, info) => {
    clog.debug('incoming IPC message: ', info.toString('utf8'), data.toString('utf8'));
  });
}

ipc.on('start', () => {
  // Things that need to be done once the ipc is "connected."
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, cleaning up...  (repeat to force exit)');
  process.removeAllListeners('SIGINT');
  process.on('SIGINT', () => {
    throw new Error('Received SIGINT twice, forcing exit.');
  });
  setTimeout(() => {
    throw new Error('Timeout expired after SIGINT, forcing exit.');
  }, 5000);
  ipc.publish('global.psinfo', `${ident}: SIGINT received`);
  ipc.unsubscribe();
  ipc.stop_watching();
  ipc.removeAllListeners();
  lock.unlock(`/tmp/eevee/proc/${ident}.pid`, (err) => {
    if (err) throw new Error(err);
  });
  process.exitCode = 0;
});
