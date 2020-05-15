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

if (debug) {
  ipc.on('start', () => {
    if (debug) clog.debug('IPC "connected"');
    // Print every message we receive if debug is enabled
    ipc.subscribe(`${ident}.#`, (data, info) => {
      clog.debug('Incoming IPC message: ', JSON.stringify(JSON.parse(data.toString()), null, 2), info);
    });
  });
}

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');

  if (process.send) process.send('ready');

  ipc.subscribe('eevee-pm.admin.#', (data, info) => {
    data = JSON.parse(data);
    clog.debug('Admin message: ', data, info);
  });

  ipc.subscribe('eevee-pm.request.#', (data, info) => {
    const request = JSON.parse(data);
    clog.debug('Request received: ', request, info);
    if (request.action === 'start') {
      clog.debug('Start request received: ', request, info);
      start(request);
    } else if (request.action === 'stop') {
      clog.debug('Stop request received: ', request, info);
      stop(request);
    } else if (request.action === 'restart') {
      clog.debug('Restart request received: ', request, info);
      stop(request);
      start(request);
    } else if (request.action === 'moduleStatus') {
      clog.debug('moduleStatus request received: ', request, info);
      moduleStatus(request);
    } else if (request.action === 'status') {
      clog.debug('status request received: ', request, info);
      status(request);
    } else {
      clog.warn('Unknown request: ', request, info);
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
  // Find out the pid of the module
  isRunning(request.target, (err, pid) => {
    if (err) {
      // If we get an err, then the module isn't running
      clog.error(err);
      const reply = JSON.stringify({
        messageID: request.messageID,
        command: 'stop',
        target: request.target,
        result: 'fail',
        childPID: null,
        err: err,
      });
      // Reply to whoever asked us
      ipc.publish(`${request.notify}.reply`, reply);
      return;
    } else if (typeof pid === 'number') {
      // We got a (hopefully) valid PID, so let's kill it
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

function moduleStatus(request) {
  // Maybe in the future we'll make this give more info
  isRunning(request.target, (err, pid) => {
    const reply = JSON.stringify({
      messageID: request.messageID,
      command: 'status',
      target: request.target,
      result: 'success',
      childPID: pid,
      err: null,
    });
    ipc.publish(`${request.notify}.reply`, reply);
  });
}

function status(request) {
  fs.readdir('/tmp/eevee/proc', (err, files) => {
    if (err) {
      clog.error(err);
      const reply = JSON.stringify({
        messageID: request.messageID,
        command: 'moduleStatus',
        target: request.target,
        result: 'fail',
        childPID: null,
        err: err,
      });
      ipc.publish(`${request.notify}.reply`, reply);
    } else {
      var runningModules = [];
      files.forEach((file) => {
        var moduleName = file.replace('.pid', '');
        clog.debug('file: ', file);
        var pid = isRunningSync(moduleName);
        if (typeof pid === 'number') {
          runningModules.push({
            moduleName: moduleName,
            pid: pid,
          });
        } else if (pid.code) {
          runningModules.push({
            moduleName: moduleName,
            pid: pid.code,
          });
        }
      });
      clog.debug('running modules: ', runningModules);
      const reply = JSON.stringify({
        messageID: request.messageID,
        command: 'status',
        target: null,
        result: 'success',
        childPID: runningModules,
        err: null,
      });
      ipc.publish(`${request.notify}.reply`, reply);
    }
    clog.debug('List of files in proc dir: ', files);
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
      if (debug) clog.debug(`Found module PID ${data}`);
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

// I know, I know
// This function is unsafe, only pass it idents you know have a pid file.
function isRunningSync(ident) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  var data = fs.readFileSync(`/tmp/eevee/proc/${ident}.pid`, 'utf8');
  data = Number.parseInt(data.toString());
  if (!Number.isNaN(data)) {
    if (debug) clog.debug(`Found module PID ${data}`);
    return Number(data);
  } else {
    const error = new Error('PID file format invalid');
    error.msg = error.message;
    error.code = 'E_PID_FILE_INVALID';
    error.path = `/tmp/eevee/proc/${ident}.pid`;
    clog.error(error);
    return error;
  }
}
