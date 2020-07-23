'use strict';

// Echo module. Parrots back what it receives

const ident = 'echo';
const debug = true;

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT, genMessageID } from '../lib/common.mjs';

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
  if (process.send) process.send('ready');
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc);
});

ipc.subscribe(`${ident}.request`, (data) => {
  const request = JSON.parse(data);
  if (debug) clog.debug('Echo request received:', request);
  const reply = {
    target: request.channel,
    text: request.args,
  };
  // D irc-connector.wetfish.outgoingMessage
  // D irc-connector.wetfish.outgoingMessage
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, reply);
});
