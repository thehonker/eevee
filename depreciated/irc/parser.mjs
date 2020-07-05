'use strict';

// Depreciated?
// Irc-parser. Takes messages from irc-connector, parses & filters them, and passes them on to modules

const debug = true;
const prefix = '<'; // Make this runtime-configurable in the future

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT, genMessageID, getConfig } from '../../lib/common.mjs';

var moduleIdent = 'irc-parser';
var moduleInstance = null;
var moduleFullIdent = moduleIdent;

if (debug) clog.debug('process.argv:', process.argv);

if (process.argv[2] === '--instance' && process.argv[3]) {
  moduleInstance = process.argv[3];
  moduleFullIdent = moduleIdent + '@' + moduleInstance;
  if (debug) clog.debug(`My moduleFullIdent is: ${moduleFullIdent}`);
} else {
  if (debug) clog.debug('No instance name provided!');
  let err = new Error('No instance name provided');
  err.code = 'E_INSTANCE_REQUIRED';
  if (process.send) process.send('fail');
  throw err;
}

lockPidFile(moduleFullIdent);

const config = getConfig(moduleFullIdent);

if (debug) clog.debug('Configuration: ', config);

// Print every message we receive if debug is enabled
if (debug) {
  clog.debug(`Subscribing to ${moduleFullIdent}.#`);
  ipc.subscribe(`${moduleFullIdent}.#`, (data, info) => {
    clog.debug('incoming IPC message: ', info, data.toString());
  });
}

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
});

process.on('SIGINT', () => {
  handleSIGINT(moduleFullIdent, ipc, debug);
});

if (debug) clog.debug(`Subscribing to 'irc-parser.${moduleInstance}.incomingMessage'`);
ipc.subscribe(`irc-parser.${moduleInstance}.incomingMessage`, (data, info) => {
  const msg = JSON.parse(data);
  if (debug) clog.debug('Incoming IRC Message:', msg);
  if (msg.message.charAt(0) === prefix) {
    if (debug) clog.debug(`Message matched prefix ${prefix}`, msg.message);
  }
});
