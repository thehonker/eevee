'use strict';

// Duckduckgo module. Replies with answers as returned by ddg instant answer api

const ident = 'duckduckgo';
const debug = true;

import { default as clog } from 'ee-log';
import { default as ddg } from 'ddg';
// Make-esLint-Happy import { default as ircColor } from 'irc-colors';

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

ipc.subscribe('ddg.request', ddginstant);

function ddginstant(data) {
  setPingListener(ipc, ident, 'running');
  const request = JSON.parse(data);
  const options = {
    useragent: 'eevee irc bot',
    no_redirects: true,
    no_html: true,
    format: 'json',
  };

  if (debug) clog.debug(request);

  ddg.query(request.args, options, (err, response) => {
    if (err) {
      setPingListener(ipc, ident, 'error');
      clog.error(err);
      const reply = {
        target: request.channel,
        text: `err.message [ ${err.code} ]`,
      };
      if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
      ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
      setPingListener(ipc, ident, 'listening');
    }
    if (debug) clog.debug('ddg response received:', response);
    var reply = null;
    // Gross, I know...
    if (response.Heading && response.AbstractSource) {
      reply = {
        target: request.channel,
        text: `${response.AbstractURL} [ ${response.Heading} - ${response.AbstractSource} ]`,
      };
    } else if (!response.Heading && response.AbstractSource) {
      reply = {
        target: request.channel,
        text: `${response.AbstractURL} [ ${response.AbstractSource} ]`,
      };
    } else if (response.Heading && !response.AbstractSource) {
      reply = {
        target: request.channel,
        text: `${response.AbstractURL} [ ${response.Heading} ]`,
      };
    } else if (!response.Heading && !response.AbstractSource) {
      reply = {
        target: request.channel,
        text: `${response.AbstractURL}`,
      };
    } else {
      reply = {
        target: request.channel,
        text: `${response.AbstractURL}`,
      };
    }

    if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
    setPingListener(ipc, ident, 'listening');
  });
}
