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

if (process.argv[2] === '--instance' && process.argv[3]) {
  moduleInstance = process.argv[3];
  moduleFullIdent = moduleIdent + '@' + moduleInstance;
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

const client = new IRC.Client(config.client);

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

  if (debug) clog.debug('Attempting to connect to IRC server');
  client.connect(config.client);

  client.on('message', (data) => {
    let msg = {};
    msg.type = data.type;
    msg.nick = data.nick;
    msg.ident = data.ident;
    msg.hostname = data.hostname;
    msg.target = data.target;
    msg.text = data.message;
    msg.time = new Date();
    msg.id = genMessageID();
    if (debug) clog.debug('Client message:', msg);
    ipc.publish('irc-parser.wetfish.incomingMessage', msg);
  });
});

process.on('SIGINT', () => {
  client.quit('SIGINT received');
  client.removeAllListeners();
  handleSIGINT(moduleFullIdent, ipc, debug);
});

client.on('registered', () => {
  if (debug) clog.debug('Client connected.');
  client.join('#botspam');
  // Join our initial channels
  // Execute login script
});

client.on('error', (message) => {
  clog.error('Client error:', message);
});

/* Disable this for now
client.on('raw', (message) => {
  // if (debug) clog.debug('raw message:', message);
});
*/
