'use strict';

// Calc module. Does math.

const ident = 'calc';
const debug = true;

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { default as mathjs } from 'mathjs';
import { ipc, lockPidFile, handleSIGINT } from '../lib/common.mjs';

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

ipc.subscribe('calc.request', (data) => {
  const request = JSON.parse(data);
  if (debug) clog.debug('Calc request received:', request);
  var reply = null;
  var parser = mathjs.parser;
  if (request.args.indexOf('!') + request.args.indexOf('factorial') != -2) {
    if (request.platform === 'irc') {
      reply = {
        target: request.channel,
        text: `[${ircColor.red('error')}] Factorials disabled`,
      };
    }
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  } else {
    const result = mathjs
      .format(parser.eval(request.args), {
        precision: 14,
      })
      .replace('undefined', ircColor.red('Error parsing input'));
    reply = {
      target: request.channel,
      text: result,
    };
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  }

  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});
