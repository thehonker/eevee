'use strict';

// Echo module. Parrots back what it receives

const ident = 'echo';
const debug = true;

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT, setPingListener } from '../lib/common.mjs';

lockPidFile(ident);

setPingListener(ipc, ident, 'init');

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
  setPingListener(ipc, ident, 'running');
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc);
});

ipc.subscribe('echo.request', (data) => {
  const request = JSON.parse(data);
  if (debug) clog.debug('Echo request received:', request);
  const reply = {
    target: request.channel,
    text: request.args,
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});
