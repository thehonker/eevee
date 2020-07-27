'use strict';

// Router/Parser/Filter module.
// Takes incoming messages, parses out commands, runs it through a (coming soon) filter, passes it to the module
// Also maintains a registry of known commands by listening for periodic command registration broadcasts

const debug = true;

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT, genMessageID, getConfig } from '../../lib/common.mjs';

var moduleIdent = 'irc-parser';
var moduleInstance = null;
var moduleFullIdent = moduleIdent;

if (process.argv[2] === '--instance' && process.argv[3]) {
  moduleInstance = process.argv[3];
  moduleFullIdent = moduleIdent + '@' + moduleInstance;
  if (debug) clog.debug(`My moduleFullIdent is: ${moduleFullIdent}`);
}

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

var config = getConfig(moduleFullIdent);

// Later this will check a pass/block list
// For now it just allows everything .'/)
const isAllowedCommand = (command) => {
  // Make eslint shut up about no-unused-vars
  if (command === command) return true;
};

if (debug) clog.debug('process.argv:', process.argv);

lockPidFile(moduleFullIdent);

// Print every message we receive if debug is enabled
/* Disabled for now
if (debug) {
  clog.debug(`Subscribing to ${moduleFullIdent}.#`);
  ipc.subscribe(`${moduleFullIdent}.#`, (data, info) => {
    clog.debug('incoming IPC message: ', info, data.toString());
  });
}
*/

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
});

process.on('SIGINT', () => {
  handleSIGINT(moduleFullIdent, ipc, debug);
});

if (debug) clog.debug(`Subscribing to 'irc-parser.${moduleInstance}.incomingMessage'`);
ipc.subscribe(`irc-parser.${moduleInstance}.incomingMessage`, (data) => {
  data = JSON.parse(data);
  if (debug) clog.debug('Incoming IRC Message:', data);
  var msgType = null;
  if (data.target.slice(0, 1) == '#') {
    msgType = 'chanmsg';
  } else {
    msgType = 'privmsg';
  }
  const msg = {
    time: new Date(),
    id: genMessageID(),
    type: msgType,
    text: data.message,
    connector: moduleFullIdent,
    platform: 'irc',
    channel: data.target,
    nick: data.nick,
    ident: `${data.ident}@${data.hostname}`,
    raw: data,
    replyTo: `irc-connector.${moduleInstance}`,
  };
  if (debug) clog.debug('Parsed message:', msg);

  ipc.publish(`broadcast.${msg.platform}.${msg.replyTo}`, JSON.stringify(msg));

  const prefix = msg.text.slice(0, config.commandPrefix.length);
  if (prefix === config.commandPrefix) {
    if (debug) clog.debug(`Message matched prefix ${config.commandPrefix}:`, msg.text);

    msg.command = msg.text.slice(config.commandPrefix.length).split(' ')[0];
    msg.args = msg.text
      .split(' ')
      .slice(1)
      .join(' ');

    if (isAllowedCommand(msg.command)) {
      if (debug) clog.debug('Received command:', msg.command + ' ' + msg.args);
      ipc.publish(`${msg.command}.request`, JSON.stringify(msg));
    }
  }
});
