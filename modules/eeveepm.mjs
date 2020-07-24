'use strict';

// Process manager for eevee-bot

const ident = 'eevee-pm';
const debug = true;

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT } from '../lib/common.mjs';
import { start, stop, moduleStatus, status } from '../lib/eeveepm.mjs';

const validRequests = {
  start: start,
  stop: stop,
  moduleStatus: moduleStatus,
  status: status,
};

// Create and lock a pid file at /tmp/eevee/proc/eevee-pm.pid
lockPidFile(ident);

if (debug) {
  ipc.on('start', () => {
    clog.debug('IPC "connected"');
    // Print every message we receive if debug is enabled
    ipc.subscribe(`${ident}.#`, (data, info) => {
      clog.debug(`Incoming IPC message (topic: ${info.topic}): `, JSON.stringify(JSON.parse(data.toString()), null, 2));
    });
  });
}

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (process.send) process.send('ready');

  ipc.subscribe('eevee-pm.request.#', (data, info) => {
    const request = JSON.parse(data);
    const action = request.action || info.topic.split('.')[2];
    if (debug) clog.debug(request, action, info.topic.split('.'));
    // eslint-disable-next-line security/detect-object-injection
    if (typeof validRequests[action] === 'function') {
      if (debug) clog.debug(`${action} request received:`, request);
      // eslint-disable-next-line security/detect-object-injection
      validRequests[action](request, (result) => {
        result = JSON.stringify(result);
        ipc.publish(`${request.notify}.reply`, result);
      });
    }
  });
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc, debug);
});
