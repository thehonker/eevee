'use strict';

// Process manager for eevee-bot

const ident = 'eevee-pm';
const debug = true;

import { default as clog } from 'ee-log';
import { default as child_process } from 'child_process';
import { default as fs } from 'fs';
import { ipc, lockPidFile, handleSIGINT } from '../lib/common.mjs';

// Create and lock a pid file at /tmp/eevee/proc/eevee-pm.pid
lockPidFile(ident);

// Print every message we receive if debug is enabled
if (debug) {
  ipc.subscribe(`${ident}.#`, (data, info) => {
    clog.debug('Incoming IPC message: ', data.toString(), info);
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

ipc.subscribe('eevee-pm.admin.#', (data, info) => {
  data = JSON.parse(data);
  clog.debug('Admin message: ', data, info);
});

ipc.subscribe('eevee-pm.request.#', (data, info) => {
  data = JSON.parse(data);
  clog.debug('Request received: ', data, info);
  if (data.action === 'start') {
    clog.debug('Start request received: ', data, info);
    start(data);
  } else if (data.action === 'stop') {
    clog.debug('Stop request received: ', data, info);
    stop(data);
  } else if (data.action === 'restart') {
    clog.debug('Restart request received: ', data, info);
    stop(data);
    start(data);
  } else {
    clog.warn('Unknown request: ', data, info);
  }
});

function start(request) {
  if (debug) clog.debug('Attempting module start: ', request);

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const out = fs.openSync(`../log/${request.target}.log`, 'a');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const err = fs.openSync(`../log/${request.target}.log`, 'a');

  const child = child_process.fork(`./${request.target}.mjs`, {
    detached: true,
    stdio: ['ignore', out, err, 'ipc'],
  });

  // Wait for the child to tell us that its ready
  child.on('message', (message) => {
    var reply;
    if (message === 'ready') {
      clog.info(`Started module: ${request.target}`);
      reply = JSON.stringify({
        messageID: request.messageID,
        command: 'start',
        target: request.target,
        result: 'success',
      });
      child.removeAllListeners();
      child.disconnect();
      child.unref();
    }
    if (message === 'fail') {
      clog.error(`Failed to start module ${request.target}`);
      reply = JSON.stringify({
        messageID: request.messageID,
        command: 'start',
        target: request.target,
        result: 'fail',
      });
      child.removeAllListeners();
      child.kill('SIGTERM');
    }

    ipc.publish(`${request.notify}.reply`, reply);
  });
}

function stop(request) {
  if (debug) clog.debug('Attempting module stop: ', request);

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.readFile(`/tmp/eevee/proc/${request.target}.pid`, 'utf8', (err, data) => {
    if (err) {
      const reply = JSON.stringify({
        messageID: request.messageID,
        command: 'stop',
        target: request.target,
        result: 'fail',
      });
      ipc.publish(`${request.notify}.reply`, reply);
    }

    if (debug) clog.debug(`Found module PID ${data}, sending SIGINT`);
    process.kill(data, 'SIGINT');
    const reply = JSON.stringify({
      messageID: request.messageID,
      command: 'stop',
      target: request.target,
      result: 'success',
    });
    ipc.publish(`${request.notify}.reply`, reply);
  });
}
