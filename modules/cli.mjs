#!/usr/bin/env node
'use strict';

// Usage: eevee [init, start, stop, restart, config, status, console, dump]

const ident = 'cli';
const debug = true;

import { default as clog } from 'ee-log';
import { ipc, lockPidFile, handleSIGINT } from '../lib/common.mjs';

// Create and lock a pid file at /tmp/eevee/proc/eevee-pm.pid
lockPidFile(ident);

// Print every message we receive if debug is enabled
if (debug) {
  ipc.subscribe(`${ident}.#`, (data, info) => {
    clog.debug('Incoming IPC message: ', data.toString(), info);
  });
}

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc);
});
