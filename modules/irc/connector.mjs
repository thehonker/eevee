'use strict';

// Irc-connector. Talks to irc servers and passes messages over to irc-parser

const debug = true;

import { default as clog } from 'ee-log';
import { default as IRC } from 'irc-framework';

import { ipc, lockPidFile, handleSIGINT, genMessageID, getConfig } from '../../lib/common.mjs';

var moduleIdent = 'irc-connector';
var moduleInstance = null;
var moduleFullIdent = moduleIdent;

if (debug) clog.debug('process.argv:', process.argv);

if (process.argv[2] === '--instance') {
  moduleInstance = process.argv[3];
  moduleFullIdent = moduleIdent + '@' + moduleInstance;
}

lockPidFile(moduleFullIdent);

const config = getConfig(moduleFullIdent);

if (debug) clog.debug('Configuration: ', config);

const client = new IRC.Client(config.client);

// Print every message we receive if debug is enabled
if (debug) {
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
  client.quit('SIGINT received');
  client.removeAllListeners();
  handleSIGINT(moduleFullIdent, ipc, debug);
});

if (debug) clog.debug('Attempting to connect to IRC server');
client.connect(config.client);

client.on('registered', () => {
  if (debug) clog.debug('Client connected.');

  // Join our initial channels
  // Execute login script
});

client.on('message', (message) => {
  if (debug) clog.debug('Client message:', message);
});

client.on('error', (message) => {
  clog.error('Client error:', message);
});

/* Disable this for now
client.on('raw', (message) => {
  // if (debug) clog.debug('raw message:', message);
});
*/
