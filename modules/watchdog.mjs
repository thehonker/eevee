'use strict';

// Watchdog module
// Periodically pings modules, if they don't answer then we try to restart them

import { default as clog } from 'ee-log';
import {
  ipc,
  lockPidFile,
  handleSIGINT,
  getConfig,
  getGlobalConfig,
  getDirName,
  readableTime,
  setPingListener
} from '../lib/common.mjs';

const debug = true;

const __dirname = getDirName();

var moduleIdent = 'watchdog';

lockPidFile(moduleIdent);

setPingListener(ipc, moduleIdent, 'init');

const config = getConfig(moduleIdent);
config.global = getGlobalConfig();
if (debug) clog.debug(config);

// Print every message we receive if debug is enabled
if (debug) {
  ipc.subscribe(`${moduleIdent}.#`, (data, info) => {
    clog.debug('incoming IPC message: ', info, data.toString());
  });
}

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
  setPingListener(ipc, moduleIdent, 'running');
});

process.on('SIGINT', () => {
  handleSIGINT(moduleIdent, ipc);
});
