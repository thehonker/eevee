'use strict';

// Echo module. Parrots back what it receives

const ident = 'emote';
const debug = true;

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';

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

ipc.subscribe('dunno.request', (data) => {
  const request = JSON.parse(data);
  const faces = ['‾\\(ツ)/‾', '¯\\(º_o)/¯', '¯\\_(シ)_/¯'];
  const reply = {
    target: request.channel,
    text: ircColor.lime(faces[Math.floor(Math.random() * faces.length)]),
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});

ipc.subscribe('dudeweed.request', (data) => {
  const request = JSON.parse(data);
  const string = ircColor.green.inverse('dude weed lmao');
  const reply = {
    target: request.channel,
    text: string,
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});
