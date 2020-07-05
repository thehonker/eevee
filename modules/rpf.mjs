'use strict';

// Router/Parser/Filter module.
// Takes incoming messages, parses out commands, runs it through a (coming soon) filter, passes it to the module
// Also maintains a registry of known commands by listening for periodic command registration broadcasts

const debug = true;
const ircPrefix = '<';

const registeredCommands = [
  {
    module: 'echo',
    command: 'echo',
  },
  {
    module: 'echo',
    command: 'say',
  },
];

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT, genMessageID, getConfig, arrayObjectExists } from '../lib/common.mjs';

var moduleIdent = 'rpf';
var moduleInstance = null;
var moduleFullIdent = moduleIdent;

if (debug) clog.debug('process.argv:', process.argv);

if (process.argv[2] === '--instance' && process.argv[3]) {
  moduleInstance = process.argv[3];
  moduleFullIdent = moduleIdent + '@' + moduleInstance;
  if (debug) clog.debug(`My moduleFullIdent is: ${moduleFullIdent}`);
}

lockPidFile(moduleFullIdent);

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

if (debug) clog.debug(`Subscribing to 'incomingMessage.#'`);
ipc.subscribe(`incomingMessage.#`, (data, info) => {
  const msg = JSON.parse(data);

  if (msg.platform === 'irc') {
    if (debug) clog.debug('Incoming IRC Message:', info, msg);

    const prefix = msg.text.slice(0, ircPrefix.length);
    if (prefix === ircPrefix) {
      if (debug) clog.debug(`Message matched prefix ${ircPrefix}:`, msg.text);

      msg.command = msg.text.slice(1).split(' ')[0];
      msg.args = msg.text
        .slice(1)
        .split(' ')
        .slice(1)
        .join(' ');

      if (debug) clog.debug('Received command: ', msg.text, msg.command, msg.args);

      if (arrayObjectExists(registeredCommands, 'command', msg.command)) {
        if (debug) clog.debug('Received valid command:', msg.command + msg.args);
      }
    }
  }
});
