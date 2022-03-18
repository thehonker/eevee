'use strict';

// Mocking module. mocking-texts the previous line said by a targeted user

const ident = 'mock';
const debug = true;

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { default as mock } from 'mocking-spongegeorge';

import { ipc, lockPidFile, handleSIGINT, setPingListener } from '../lib/common.mjs';

lockPidFile(ident);

setPingListener(ipc, ident, 'init');

const help = [
  {
    command: 'mock',
    descr: 'mock the target or last line said',
    params: [
      {
        param: 'user',
        required: false,
        descr: 'User to target',
      },
    ],
  },
];

var lastLineSaid = '';
const userLines = {};

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
  setPingListener(ipc, ident, 'listening');
});

process.on('SIGINT', () => {
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

ipc.subscribe('mock.request', (data) => {
  setPingListener(ipc, ident, 'working');
  const request = JSON.parse(data);
  clog.debug(request);
  var line = '';
  // If they specified a target
  if (request.args.length !== 0) {
    // Lookup last said by user
    const target = request.args.split(' ')[0].toLowerCase();
    // eslint-disable-next-line security/detect-object-injection
    if (userLines[target]) {
      // eslint-disable-next-line security/detect-object-injection
      line = userLines[target];
    }
    // Parrot it
  } else {
    // Lookup last line
    // Parrot it
    line = lastLineSaid;
  }
  if (line.length !== 0) {
    line = mock(line);
    clog.debug(line);
    line = ircColor.blue(line);
    const reply = {
      target: request.channel,
      text: line,
    };
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  }
  return;
});

// Listen for new lines
ipc.subscribe('_broadcast.incomingMessage.#', (data) => {
  const request = JSON.parse(data);
  if (request.command !== 'mock') {
    lastLineSaid = request.text;
    const nick = request.nick.toLowerCase();
    // eslint-disable-next-line security/detect-object-injection
    userLines[nick] = request.text;
  }
  return;
});
