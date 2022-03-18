'use strict';

// Router/Parser/Filter module.
// Takes incoming messages, parses out commands, runs it through a (coming soon) filter, passes it to the module
// Also maintains a registry of known commands by listening for periodic command registration broadcasts

const debug = true;

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT, genMessageID, getConfig, setPingListener } from '../../lib/common.mjs';

var moduleIdent = 'irc-parser';
var moduleInstance = null;
var moduleFullIdent = moduleIdent;

if (process.argv[2] === '--instance' && process.argv[3]) {
  moduleInstance = process.argv[3];
  moduleFullIdent = moduleIdent + '.' + moduleInstance;
  if (debug) clog.debug(`My moduleFullIdent is: ${moduleFullIdent}`);
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

setPingListener(ipc, moduleFullIdent, 'init');

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
  setPingListener(ipc, moduleFullIdent, 'running');
});

process.on('SIGINT', () => {
  handleSIGINT(moduleFullIdent, ipc);
});

if (debug) clog.debug(`Subscribing to 'irc-parser.${moduleInstance}.incomingMessage'`);
ipc.subscribe(`irc-parser.${moduleInstance}.incomingMessage`, (data) => {
  data = JSON.parse(data);
  if (debug) clog.debug('Incoming IRC Message:', data);
  var msgType = null;
  var target = null;
  if (data.target.slice(0, 1) == '#') {
    msgType = 'chanmsg';
    target = data.target;
  } else {
    msgType = 'privmsg';
    target = data.nick;
  }
  const msg = {
    time: new Date(),
    id: genMessageID(),
    type: msgType,
    text: data.message,
    connector: moduleFullIdent,
    platform: 'irc',
    channel: target,
    nick: data.nick,
    ident: `${data.ident}@${data.hostname}`,
    raw: data,
    replyTo: `irc-connector.${moduleInstance}`,
  };
  if (debug) clog.debug('Parsed message:', msg);

  if (msg.text === '.bots') {
    const reply = {
      target: msg.channel,
      text: `Reporting in! [nodejs] eevee irc connector v0.4.20 (try "${config.client.nick}: help")`,
    };
    if (debug) clog.debug(`Sending reply to: ${msg.replyTo}.outgoingMessage`, reply);
    ipc.publish(`${msg.replyTo}.outgoingMessage`, JSON.stringify(reply));
    return;
  }

  // eslint-disable-next-line security/detect-non-literal-regexp
  const prefixRegex = new RegExp(config.prefixRegex);
  if (prefixRegex.test(msg.text)) {
    const prefix = msg.text.match(prefixRegex);

    if (debug) clog.debug(`Message matched prefix ${prefix}:`, msg.text);
    msg.command = msg.text.slice(prefix.length).split(' ')[0];
    msg.args = msg.text
      .split(' ')
      .slice(1)
      .join(' ');
    msg.prefix = prefix;

    if (isAllowedCommand(msg.command)) {
      if (debug) clog.debug('Received command:', msg.command + ' ' + msg.args);
      ipc.publish(`${msg.command}.request`, JSON.stringify(msg));
      ipc.publish(`_broadcast.incomingMessage.${msg.platform}.${msg.replyTo}`, JSON.stringify(msg));
    }
  } else if (msg.text.split(' ')[0] === `${config.client.nick}:`) {
    clog.debug('nick prefix matched!');
    const prefix = `${config.client.nick}: `;
    if (debug) clog.debug(`Message matched prefix ${prefix}:`, msg.text);
    msg.command = msg.text.split(' ').slice(1)[0];
    msg.args = msg.text
      .split(' ')
      .slice(2)
      .join(' ');
    msg.prefix = prefix;

    if (isAllowedCommand(msg.command)) {
      if (debug) clog.debug('Received command:', msg.command + ' ' + msg.args);
      ipc.publish(`${msg.command}.request`, JSON.stringify(msg));
      ipc.publish(`_broadcast.incomingMessage.${msg.platform}.${msg.replyTo}`, JSON.stringify(msg));
    }
  } else {
    // Foo
    ipc.publish(`_broadcast.incomingMessage.${msg.platform}.${msg.replyTo}`, JSON.stringify(msg));
  }
});
