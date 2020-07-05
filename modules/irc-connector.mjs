'use strict';

// Irc. Talks to irc servers and passes messages over to irc-parser

const debug = true;

import { default as clog } from 'ee-log';
import { default as IRC } from 'irc-framework';

import { ipc, lockPidFile, handleSIGINT, genMessageID, getConfig } from '../lib/common.mjs';

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

client.on('message', (data) => {
  var type = null;
  if (data.target.slice(0, 1) == '#') {
    type = 'chanmsg';
  } else {
    type = 'privmsg';
  }
  const msg = {
    time: new Date(),
    id: genMessageID(),
    type: type,
    text: data.message,
    connector: moduleFullIdent,
    platform: 'irc',
    server: config.host,
    channel: data.target,
    nick: data.nick,
    ident: `${data.ident}@${data.hostname}`,
    raw: data,
  };

  if (debug) clog.debug('Client message:', msg);
  ipc.publish(`incomingMessage.irc`, JSON.stringify(msg));
});

/* Example:
message = {
  text: ['~echo', 'foo', 'bar', 'baz'],
  formattedText: [ // Let's pretend that Weazzy sent 'foo bar baz' in these colors
    ['~echo ', {plain: true,}],
    ['foo ', {fgColor: 'red',}],
    ['bar ', {fgColor: 'blue', bgColor: 'yellow'}],
    ['baz ', {style: 'bold', fgColor: 'green'}],
  ],
  from: {
    module:     'irc.wetfish',  // Our module ident
    platform:   'irc',          // Matrix, Discord, etc. Allows modules to apply platform-specific goodies
    server:     'irc.wetfish',  // Server ident as defined in config - doesn't necessarily match module ident
    channel:    '#botspam',     // # for channels, @ for pm's
    nick:       'Weazzy',       // User's display name
    ident:      'Weazzy@lu.dicro.us', // Full ident
  },
  raw: {}, // Raw event as delivered by the connector library
}
ipc.emit('rpf:incoming', message);
*/

ipc.subscribe(`irc.${moduleInstance}.outgoingMessage`, (data, info) => {
  const msg = JSON.parse(data);
  if (debug) clog.debug('Received outgoingMessage:', msg);
  client.say(msg.target, msg.text);
});
