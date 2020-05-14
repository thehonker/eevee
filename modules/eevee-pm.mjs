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

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');

  // Print every message we receive if debug is enabled
  if (debug) {
    ipc.subscribe(`${ident}.#`, (data, info) => {
      clog.debug('Incoming IPC message: ', data.toString(), info);
    });
  }

  if (process.send) process.send('ready');

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
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc);
});

function start(request) {
  if (debug) clog.debug('Attempting module start: ', request);
  isRunning(request.target, (err, pid) => {
    // If we receive an error object, the module isn't running.
    if (err) {
      var out = null;
      try {
        // Can we open the log file?
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        out = fs.openSync(`../log/${request.target}.log`, 'a');
      } catch (err) {
        const reply = JSON.stringify({
          messageID: request.messageID,
          command: 'start',
          target: request.target,
          result: 'fail',
          childPID: null,
          err: err,
        });
        ipc.publish(`${request.notify}.reply`, reply);
        return;
      }
      var child = null;
      try {
        child = child_process.fork(`./${request.target}.mjs`, {
          detached: true,
          stdio: ['ignore', out, out, 'ipc'],
        });
      } catch (err) {
        clog.error(`Failed to start module ${request.target}: E_FORK_FAILED`);
        const error = new Error('Unable to fork child');
        error.msg = error.message;
        error.code = 'E_FORK_FAILED';
        error.path = `/tmp/eevee/proc/${request.target}.pid`;
        const reply = JSON.stringify({
          messageID: request.messageID,
          command: 'start',
          target: request.target,
          result: 'fail',
          childPID: null,
          err: error,
        });
        ipc.publish(`${request.notify}.reply`, reply);
        return;
      }
      // Wait for the child to tell us that it is ready
      child.on('message', (message) => {
        if (message === 'ready') {
          // Child says "I'm good to go"
          clog.info(`Started module: ${request.target}`);
          const reply = JSON.stringify({
            messageID: request.messageID,
            command: 'start',
            target: request.target,
            result: 'success',
            childPID: child.pid,
            err: null,
          });
          child.removeAllListeners();
          child.disconnect();
          child.unref();
          ipc.publish(`${request.notify}.reply`, reply);
          return;
        } else if (message === 'fail') {
          // Child says "I'm broken!"
          clog.error(`Failed to start module ${request.target}: E_CHILD_REPORT_INIT_FAIL`);
          const error = new Error('Child reports init failed');
          error.msg = error.message;
          error.code = 'E_CHILD_REPORT_INIT_FAIL';
          error.path = `/tmp/eevee/proc/${request.target}.pid`;
          const reply = JSON.stringify({
            messageID: request.messageID,
            command: 'start',
            target: request.target,
            result: 'fail',
            childPID: null,
            err: error,
          });
          child.removeAllListeners();
          child.kill('SIGTERM');
          ipc.publish(`${request.notify}.reply`, reply);
          return;
        }
      });
    } else if (typeof pid === 'number') {
      // If we receive a number for pid then the module is (probably) already running.
      const error = new Error('Module already running');
      error.msg = error.message;
      error.code = 'E_ALREADY_RUNNING';
      error.path = `/tmp/eevee/proc/${request.target}.pid`;
      const reply = JSON.stringify({
        messageID: request.messageID,
        command: 'start',
        target: request.target,
        result: 'fail',
        childPID: pid,
        err: error,
      });
      ipc.publish(`${request.notify}.reply`, reply);
      return;
    }
  });
}

function stop(request) {
  if (debug) clog.debug('Attempting module stop: ', request);
  isRunning(request.target, (err, pid) => {
    if (err) {
      clog.error(err);
      const reply = JSON.stringify({
        messageID: request.messageID,
        command: 'stop',
        target: request.target,
        result: 'fail',
        childPID: null,
        err: err,
      });
      ipc.publish(`${request.notify}.reply`, reply);
      return;
    } else if (typeof pid === 'number') {
      if (debug) clog.debug(`Found module PID ${pid}, sending SIGINT`);
      process.kill(pid, 'SIGINT');
      const reply = JSON.stringify({
        messageID: request.messageID,
        command: 'stop',
        target: request.target,
        result: 'success',
        childPID: pid,
        err: null,
      });
      ipc.publish(`${request.notify}.reply`, reply);
      return;
    }
  });
}

function isRunning(ident, cb) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.readFile(`/tmp/eevee/proc/${ident}.pid`, 'utf8', (err, data) => {
    if (err) {
      clog.error(err);
      cb(err);
      return;
    }
    data = Number.parseInt(data.toString());
    if (!Number.isNaN(data)) {
      if (debug) clog.debug(`Found module PID ${Number(data)}`);
      cb(null, Number(data));
      return;
    } else {
      const error = new Error('PID file format invalid');
      error.msg = error.message;
      error.code = 'E_PID_FILE_INVALID';
      error.path = `/tmp/eevee/proc/${ident}.pid`;
      clog.error(error);
      cb(error);
      return;
    }
  });
}
