'use strict';

// Help module
// Gathers help docs from other modules and pretty prints them

const ident = 'help';
const debug = true;

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT, setPingListener } from '../lib/common.mjs';

lockPidFile(ident);

setPingListener(ipc, ident, 'init');

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
  setPingListener(ipc, ident, 'listening');
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc);
});

ipc.subscribe('help.request', (data) => {
  setPingListener(ipc, ident, 'running');
  const request = JSON.parse(data);
  if (debug) clog.debug('help request received:', request);
  const reply = {
    target: request.channel,
    text: 'Under construction!',
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  setPingListener(ipc, ident, 'listening');
});
