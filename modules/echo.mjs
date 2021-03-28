'use strict';

// Echo module. Parrots back what it receives

const ident = 'echo';
const debug = true;

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT } from '../lib/common.mjs';

lockPidFile(ident);

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc);
});

ipc.subscribe(`${ident}.ping`, (data) => {
  const pingRequest = JSON.parse(data);
  if (debug) clog.debug('Ping request received:', pingRequest);
  const pingReply = {
    requestId: pingRequest.requestId,
    ident: ident,
    pid: process.pid,
    status: 'running',
  };
  if (debug) clog.debug(`Sending reply to: ${pingRequest.replyTo}`, pingReply);
  ipc.publish(pingRequest.replyTo, JSON.stringify(pingReply));
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
