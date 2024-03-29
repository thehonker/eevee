'use strict';

// Calc module. Does math.

const ident = 'calc';
const debug = true;

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { ipc, lockPidFile, handleSIGINT, setPingListener } from '../lib/common.mjs';
import { default as mathjs } from 'mathjs';

lockPidFile(ident);

setPingListener(ipc, ident, 'init');

// Print every message we receive if debug is enabled
if (debug) {
  ipc.subscribe(`${ident}.#`, (data, info) => {
    clog.debug('incoming IPC message: ', info, data.toString());
  });
}

const help = [
  {
    command: 'calc',
    descr: 'Evaluate a math expression with mathJS',
    params: [
      {
        param: 'expression',
        required: true,
        descr: 'Expression to evaluate',
      },
    ],
  },
  {
    command: 'c',
    descr: 'Alias to calc command',
    params: [],
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

ipc.subscribe('calc.request', (data) => {
  calc(data);
});

ipc.subscribe('c.request', (data) => {
  calc(data);
});

function calc(data) {
  const request = JSON.parse(data);
  if (debug) clog.debug('Calc request received:', request);
  try {
    var reply = null;
    if (request.args.indexOf('!') + request.args.indexOf('factorial') != -2) {
      if (request.platform === 'irc') {
        reply = {
          target: request.channel,
          text: `${ircColor.red('Error:')} Factorials disabled`,
        };
      }
      ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
    } else {
      const result = mathjs.evaluate(request.args);
      reply = {
        target: request.channel,
        text: result.toString(),
      };
      ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
    }
  } catch (err) {
    if (request.platform === 'irc') {
      reply = {
        target: request.channel,
        text: `${ircColor.red('Error:')} ${err.message}`,
      };
      ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
    }
  }
}
