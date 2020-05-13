'use strict';

// Process manager for eevee-bot

const ident = 'eevee-pm';
const debug = true;

import { default as clog } from 'ee-log';
import { default as child_process } from 'child_process';
import { default as fs } from 'fs';
import { ipc, lockPidFile, handleSIGINT } from '../lib/common.mjs';

// Create and lock a pid file at /tmp/eevee/proc/eevee-pm.pid
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

function start(request) {
  if (debug) clog.debug('Start request received: ', request);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const out = fs.openSync(`../log/${request.ident}.log`, 'a');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const err = fs.openSync(`../log/${request.ident}.log`, 'a');
  const child = child_process.fork(`./${request.ident}.mjs`, {
    detached: true,
    stdio: ['ignore', out, err, 'ipc'],
  });
  child.disconnect();
  child.unref();
}

setTimeout(() => {
  start({
    ident: 'test1',
  });
}, 2000);
