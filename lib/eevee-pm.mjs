'use strict';

// Abstracted functions from eevee-pm so other modules can use them if desired.

import { default as clog } from 'ee-log';
import { default as child_process } from 'child_process';
import { default as fs } from 'fs';

const debug = true;

export function start(request, cb) {
  if (debug) clog.debug('Attempting module start: ', request);
  isRunning(request.target, (err, pid) => {
    // If we receive an error object, the module isn't running.
    if (err) {
      var out = null;
      var module = null;
      var instance = null;
      if (request.target.includes('@')) {
        module = request.target.split('@')[0];
        instance = request.target.split('@')[1];
      } else {
        module = request.target;
      }
      try {
        // Can we open the log file?
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        out = fs.openSync(`../log/${request.target}.log`, 'a');
      } catch (err) {
        const result = JSON.stringify({
          messageID: request.messageID,
          command: 'start',
          target: request.target,
          result: 'fail',
          childPID: null,
          err: err,
        });
        if (debug) clog.debug(result);
        if (cb) cb(result);
        return result;
      }
      var child = null;
      try {
        var filename = module.replace('-', '/');
        if (debug) clog.debug(`Path: ./${filename}.mjs`);
        child = child_process.fork(`./${filename}.mjs`, instance ? ['--instance', instance] : null, {
          detached: true,
          stdio: ['ignore', out, out, 'ipc'],
        });
      } catch (err) {
        clog.error(err);
        clog.error(`Failed to start module ${request.target}: E_FORK_FAILED`);
        const error = new Error('Unable to fork child');
        error.msg = error.message;
        error.code = 'E_FORK_FAILED';
        error.path = `/tmp/eevee/proc/${request.target}.pid`;
        const result = JSON.stringify({
          messageID: request.messageID,
          command: 'start',
          target: request.target,
          result: 'fail',
          childPID: null,
          err: error,
        });
        if (debug) clog.debug(result);
        if (cb) cb(result);
        return result;
      }
      // Wait for the child to tell us that it is ready
      child.on('message', (message) => {
        if (message === 'ready') {
          // Child says "I'm good to go"
          clog.info(`Started module: ${request.target}`);
          const result = JSON.stringify({
            messageID: request.messageID,
            command: 'start',
            target: request.target,
            result: 'success',
            childPID: child.pid,
            err: null,
          });
          // Say goodbye!
          child.removeAllListeners();
          child.disconnect();
          child.unref();
          if (debug) clog.debug(result);
          if (cb) cb(result);
          return result;
        } else if (message === 'fail') {
          // Child says "I'm broken!"
          clog.error(`Failed to start module ${request.target}: E_CHILD_REPORT_INIT_FAIL`);
          const error = new Error('Child reports init failed');
          error.msg = error.message;
          error.code = 'E_CHILD_REPORT_INIT_FAIL';
          error.path = `/tmp/eevee/proc/${request.target}.pid`;
          const result = JSON.stringify({
            messageID: request.messageID,
            command: 'start',
            target: request.target,
            result: 'fail',
            childPID: null,
            err: error,
          });
          child.removeAllListeners();
          child.kill('SIGTERM');
          if (debug) clog.debug(result);
          if (cb) cb(result);
          return result;
        }
      });
    } else if (typeof pid === 'number') {
      // If we receive a number for pid then the module is (probably) already running.
      const error = new Error('Module already running');
      error.msg = error.message;
      error.code = 'E_ALREADY_RUNNING';
      error.path = `/tmp/eevee/proc/${request.target}.pid`;
      const result = JSON.stringify({
        messageID: request.messageID,
        command: 'start',
        target: request.target,
        result: 'fail',
        childPID: pid,
        err: error,
      });
      if (debug) clog.debug(result);
      if (cb) cb(result);
      return result;
    }
  });
}

export function stop(request, cb) {
  if (debug) clog.debug('Attempting module stop: ', request);
  // Find out the pid of the module
  isRunning(request.target, (err, pid) => {
    if (err) {
      // If we get an err, then the module isn't running
      clog.error(err);
      const result = JSON.stringify({
        messageID: request.messageID,
        command: 'stop',
        target: request.target,
        result: 'fail',
        childPID: null,
        err: err,
      });
      // Reply to whoever asked us
      if (debug) clog.debug(result);
      if (cb) cb(result);
      return result;
    } else if (typeof pid === 'number') {
      // We got a (hopefully) valid PID, so let's kill it
      if (debug) clog.debug(`Found module PID ${pid}, sending SIGINT`);
      process.kill(pid, 'SIGINT');
      const result = JSON.stringify({
        messageID: request.messageID,
        command: 'stop',
        target: request.target,
        result: 'success',
        childPID: pid,
        err: null,
      });
      if (debug) clog.debug(result);
      if (cb) cb(result);
      return result;
    }
  });
}

export function moduleStatus(request, cb) {
  // Maybe in the future we'll make this give more info
  isRunning(request.target, (err, pid) => {
    const result = JSON.stringify({
      messageID: request.messageID,
      command: 'moduleStatus',
      target: request.target,
      result: 'success',
      childPID: pid,
      err: null,
    });
    if (debug) clog.debug(result);
    if (cb) cb(result);
    return result;
  });
}

export function status(request, cb) {
  fs.readdir('/tmp/eevee/proc', (err, files) => {
    clog.debug('List of files in proc dir: ', files);
    if (err) {
      clog.error(err);
      const result = JSON.stringify({
        messageID: request.messageID,
        command: 'status',
        target: request.target,
        result: 'fail',
        childPID: null,
        err: err,
      });
      if (debug) clog.debug(result);
      if (cb) cb(result);
      return result;
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
      const result = JSON.stringify({
        messageID: request.messageID,
        command: 'status',
        target: null,
        result: 'success',
        childPID: runningModules,
        err: null,
      });
      if (debug) clog.debug(result);
      if (cb) cb(result);
      return result;
    }
  });
}

export function isRunning(ident, cb) {
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
// This function is unsafe, only pass it things you know have a pid file.
export function isRunningSync(ident) {
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
