'use strict';

// Abstracted functions from eevee-pm so other modules can use them if desired.

import { default as clog } from 'ee-log';
import { default as child_process } from 'child_process';
import { promisify as util__promisify } from 'util';
import { getDirName, getGlobalConfig, genMessageID } from '../lib/common.mjs';
import * as fs from 'fs';
// import * as fsPromises from 'fs/promises';
const debug = true;

const __dirname = getDirName();

const globalConfig = getGlobalConfig();
const procPath = globalConfig.procPath;

// Ensure that /tmp/eevee exists
// Sync function
export function checkProcPath() {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!fs.existsSync(`${procPath}/proc`)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      fs.mkdirSync(`${procPath}/proc`, { recursive: true });
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!fs.existsSync(`${procPath}/ipc`)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      fs.mkdirSync(`${procPath}/ipc`, { recursive: true });
    }
  } catch (err) {
    clog.error(`[eeveepm] Could not create proc directory at ${procPath}`, err);
    if (err) throw new Error(`Could not create proc directory at ${procPath}`);
  }
}

export function moduleStart(request, cb) {
  checkProcPath();
  if (debug) clog.debug('Attempting module start: ', request);
  isRunning(request.target, (err, result) => {
    // If we receive an error object, the module isn't running.
    if (err) {
      var out = null;
      var module = null;
      var instance = null;
      if (request.target.includes('.')) {
        module = request.target.split('.')[0];
        instance = request.target.split('.')[1];
      } else {
        module = request.target;
      }
      try {
        // Can we open the log file?
        if (debug) clog.debug(`${__dirname}/../log/${request.target}.log`);
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        out = fs.openSync(`${__dirname}/../log/${request.target}.log`, 'a');
      } catch (err) {
        const result = {
          messageID: request.messageID,
          command: 'start',
          target: request.target,
          result: 'fail',
          childPID: null,
          err: err,
        };
        if (debug) clog.debug(result);
        if (cb) cb(result);
        return result;
      }

      // Spawn the child
      var child = null;
      try {
        var filename = module.replace('-', '/');
        if (debug) clog.debug(`Path: ${__dirname}/../modules/${filename}.mjs`);
        child = child_process.fork(
          `${__dirname}/../modules/${filename}.mjs`,
          instance ? ['--instance', instance] : null,
          {
            detached: true,
            stdio: ['ignore', out, out, 'ipc'],
          },
        );
      } catch (err) {
        clog.error(err);
        clog.error(`Failed to start module ${request.target}: E_FORK_FAILED`);
        const error = new Error('Unable to fork child');
        error.msg = error.message;
        error.code = 'E_FORK_FAILED';
        error.path = `${procPath}/proc/${request.target}.pid`;
        const result = {
          messageID: request.messageID,
          command: 'start',
          target: request.target,
          result: 'fail',
          childPID: null,
          err: error,
        };
        if (debug) clog.debug(result);
        if (cb) cb(result);
        return result;
      }
      // Wait for the child to tell us that it is ready
      child.on('message', (message) => {
        if (message === 'ready') {
          // Child says "I'm good to go"
          if (debug) clog.debug(`Started module: ${request.target}`);
          const result = {
            messageID: request.messageID,
            command: 'start',
            target: request.target,
            result: 'success',
            childPID: child.pid,
            err: null,
          };
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
          error.path = `${procPath}/proc/${request.target}.pid`;
          const result = {
            messageID: request.messageID,
            command: 'start',
            target: request.target,
            result: 'fail',
            childPID: null,
            err: error,
          };
          child.removeAllListeners();
          child.kill('SIGTERM');
          if (debug) clog.debug(result);
          if (cb) cb(result);
          return result;
        }
      });
    } else if (typeof result.pid === 'number') {
      // If we receive a number for pid then the module is (probably) already running.
      const error = new Error('Module already running');
      error.msg = error.message;
      error.code = 'E_ALREADY_RUNNING';
      error.path = `${procPath}/proc/${request.target}.pid`;
      const childInfo = {
        messageID: request.messageID,
        command: 'start',
        target: request.target,
        result: 'fail',
        childPID: result.pid,
        err: error,
      };
      if (debug) clog.debug(childInfo);
      if (cb) cb(childInfo);
      return result;
    }
  });
}

export function moduleStop(request, cb) {
  checkProcPath();
  if (debug) clog.debug('Attempting module stop: ', request);
  // Find out the pid of the module
  isRunning(request.target, (err, childInfo) => {
    if (err) {
      // If we get an err, then the module isn't running
      clog.error(err);
      const result = {
        messageID: request.messageID,
        command: 'stop',
        target: request.target,
        result: 'fail',
        childPID: null,
        err: err,
      };
      // Reply to whoever asked us
      if (debug) clog.debug(result);
      if (cb) cb(result);
      return result;
    } else if (typeof childInfo.pid === 'number') {
      // We got a (hopefully) valid PID, so let's kill it
      if (debug) clog.debug(`Found module PID ${childInfo.pid}, sending SIGINT`);
      process.kill(childInfo.pid, 'SIGINT');
      const result = {
        messageID: request.messageID,
        command: 'stop',
        target: request.target,
        result: 'success',
        childPID: childInfo.pid,
        err: null,
      };
      if (debug) clog.debug(result);
      if (cb) cb(result);
      return result;
    }
  });
}

export function moduleStatus(request, cb) {
  checkProcPath();
  // Maybe in the future we'll make this give more info
  isRunning(request.target, (err, result) => {
    const status = {
      messageID: request.messageID,
      command: 'moduleStatus',
      target: request.target,
      result: 'success',
      childPID: result.pid,
      childStatus: result.status,
      err: null,
    };
    if (debug) clog.debug(status);
    if (cb) cb(status);
    return status;
  });
}

export function botStatus(request, cb) {
  checkProcPath();
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.readdir(`${procPath}/proc`, (err, files) => {
    if (debug) clog.debug('List of files in proc dir: ', files);
    if (err) {
      clog.error(err);
      const result = {
        messageID: request.messageID,
        command: 'status',
        target: request.target,
        result: 'fail',
        childPID: null,
        err: err,
      };
      if (debug) clog.debug(result);
      if (cb) cb(result);
      return result;
    } else {
      var runningModules = [];
      files.forEach((file) => {
        var moduleName = file.replace('.pid', '');
        if (debug) clog.debug('file: ', file);
        var result = isRunningSync(moduleName);
        if (typeof result.pid === 'number') {
          runningModules.push({
            moduleName: moduleName,
            pid: result.pid,
          });
        } else if (result.pid.code) {
          runningModules.push({
            moduleName: moduleName,
            pid: result.pid.code,
          });
        }
      });
      if (debug) clog.debug('running modules: ', runningModules);
      const result = {
        messageID: request.messageID,
        command: 'status',
        target: null,
        result: 'success',
        childPID: runningModules,
        err: null,
      };
      if (debug) clog.debug(result);
      if (cb) cb(result);
      return result;
    }
  });
}

export function isRunning(ident, cb) {
  checkProcPath();
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.readFile(`${procPath}/proc/${ident}.pid`, 'utf8', (err, data) => {
    if (err) {
      if (debug) clog.error(err);
      cb(err);
      return;
    }
    data = Number.parseInt(data.toString());
    if (!Number.isNaN(data)) {
      if (debug) clog.debug(`Found module PID ${data}`);
      // TODO Check if process with pid actually exists
      const pid = Number(data);
      const result = {
        pid: pid,
        status: 'running',
      };
      cb(null, result);
      return;
    } else {
      const error = new Error('PID file format invalid');
      error.code = 'E_PID_FILE_INVALID';
      error.path = `${procPath}/proc/${ident}.pid`;
      clog.error(error);
      cb(error);
      return;
    }
  });
}

// I know, I know
// This function is unsafe, only pass it things you know have a pid file.
export function isRunningSync(ident) {
  checkProcPath();
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  var data = fs.readFileSync(`${procPath}/proc/${ident}.pid`, 'utf8');
  data = Number.parseInt(data.toString());
  if (!Number.isNaN(data)) {
    if (debug) clog.debug(`Found module PID ${data}`);
    const result = {
      pid: Number(data),
      status: 'running',
    };
    return result;
  } else {
    const error = new Error('PID file format invalid');
    error.code = 'E_PID_FILE_INVALID';
    error.path = `${procPath}/proc/${ident}.pid`;
    clog.error(error);
    return error;
  }
}

export function isRunningPromise(ipc, ident) {
  // Pre-build the status object
  const status = {
    ident: ident,
    pid: null,
    status: 'unknown',
    pidFileStatus: 'unknown',
  };

  // Verify that /tmp/eevee/ exists
  checkProcPath();

  // Return a promise that resolves when we have module status
  return new Promise((resolve, reject) => {
    // Read the pid file
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.readFile(`${procPath}/proc/${ident}.pid`, 'utf8', (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          status.pidFileStatus = 'missing';
          if (debug) clog.debug('ENOENT');
        } else {
          return reject(err);
        }
      }
      if (typeof data === 'undefined') {
        data = '';
      }
      const pidFileData = Number.parseInt(data.toString());
      // Ping the module via ipc
      // First, set a timeout to give up after 5 seconds
      const timeout = setTimeout(() => {
        if (pidFileData.toString() === 'NaN') {
          status.status = 'stopped';
          status.pidFileStatus = 'missing';
          return resolve(status);
        } else if (typeof pidFileData === 'number') {
          if (pidIsRunning(pidFileData)) {
            status.status = 'stale';
            status.pidFileStatus = 'stale';
            return resolve(status);
          }
        }
      }, 1000);

      // Build the ping request
      const pingRequest = {
        requestId: genMessageID(),
        replyTo: 'eevee-pm.pong',
      };
      clog.debug(`ping request: ${JSON.stringify(pingRequest)}`);

      // Subscribe to a ping reply
      ipc.subscribe('eevee-pm.pong', (data) => {
        const pingReply = JSON.parse(data);
        if (debug) clog.debug('Ping reply received:', pingReply);
        // Set the pid in status object
        status.pid = pingReply.pid;
        status.status = pingReply.status;

        // Check if pid file matches reported pid
        if (!Number.isNaN(pidFileData)) {
          if (pidFileData === status.pid) {
            status.pidFileStatus = 'valid';
          } else {
            status.pidFileStatus = 'stale';
          }
        } else {
          status.pidFileStatus = 'invalid';
        }

        // Clear our timeout
        clearTimeout(timeout);
        // Return the status object
        return resolve(status);
      });
      // Send the ping out
      ipc.publish(`${ident}.ping`, JSON.stringify(pingRequest));
    });
  });
}

export function pidIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return false;
  }
}
