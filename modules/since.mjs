'use strict';

// Seen module. Saves the last line it heard from a user

const ident = 'since';

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';

import { ipc, lockPidFile, handleSIGINT, setPingListener } from '../lib/common.mjs';

// Globals
const debug = true;
var users = {};

lockPidFile(ident);

setPingListener(ipc, ident, 'init');

const help = [
  {
    command: 'since',
    descr: 'Seen in the last X minutes',
    params: [
      {
        param: 'minutes',
        required: true,
        descr: 'The amount of time to look back',
      },
    ],
  },
];

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
  ipc.publish(
    '_help.update',
    JSON.stringify({
      from: ident,
      help: help,
    }),
  );
  setPingListener(ipc, ident, 'running');
});

process.on('SIGINT', () => {
  // Common handler
  handleSIGINT(ident, ipc);
});

ipc.subscribe('_help.updateRequest', () => {
  ipc.publish(
    '_help.update',
    JSON.stringify({
      from: ident,
      help: help,
    }),
  );
});

// Retrieve users seen in last X minutes
ipc.subscribe('since.request', (data) => {
  const request = JSON.parse(data);
  if (debug) clog.debug('Since request received:', request);
  const lookbackTime = request.args.split(' ')[0];
  var sinceLookback = [];
  for (var i in users) {
    // eslint-disable-next-line security/detect-object-injection, prettier/prettier
    if (users[i].dateSeen >= Date.now() - ((lookbackTime > 1440) ? 1440 : lookbackTime) * 60000) {
      sinceLookback.push(i);
    }
  }
  var replyText = '';
  if (sinceLookback.length === 0) {
    replyText = ircColor.red("I haven't seen anyone yet");
  } else {
    // eslint-disable-next-line prettier/prettier
    replyText = `In the last ${ircColor.green(lookbackTime)} minutes, I've seen: ${ircColor.blue(sinceLookback.join(', '))}`;
  }
  const reply = {
    target: request.channel,
    text: replyText,
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  return;
});

// Listen for new lines
ipc.subscribe('_broadcast.incomingMessage.#', (data) => {
  const request = JSON.parse(data);
  if (debug) clog.debug(`Got line`, request);
  users[request.nick] = {
    dateSeen: Date.now(),
  };
  return;
});
