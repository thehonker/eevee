'use strict';

// Abstracted functions from eevee-pm so other modules can use them if desired.

import { default as clog } from 'ee-log';
import { default as child_process } from 'child_process';
import { getDirName, getGlobalConfig, genMessageID } from '../lib/common.mjs';
import * as fs from 'fs';

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

export function moduleStartCallback(request, cb) {
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

export function moduleStart(ipc, ident, args) {
  if (debug) clog.debug('Function moduleStart(ident, args) args:', ident, args);
  checkProcPath();
  // Check if module is running
  return new Promise((resolve, reject) => {
    moduleStatus(ipc, ident)
      .then((result) => {
        var err = null
        // Parse module status
        switch (result.status) {
          // If the module is running
          case 'running':
            // Check pidFileStatus
            switch (result.pidFileStatus) {
              case 'valid':
                err = new Error('Module already running (valid pid file)');
                err.code = 'E_RUNNING_VALID';
                return reject(err);
              case 'stale':
                err = new Error('Module already running (stale pid file)');
                err.code = 'E_RUNNING_STALE';
                return reject(err);
              default:
                err = new Error('Unknown Error');
                err.code = 'E_ERR_UNKNOWN';
                return reject(err);
            }
          // If the module appears to be running but is unresponsive
          case 'unresponsive':
            // Check pidFileStatus
            switch (result.pidFileStatus) {
              case 'stale':
                err = new Error('Module might be running but but did not respond to to ping (invalid pid file)');
                err.code = 'E_UNRESPONSIVE_STALE';
                return reject(err);
              default:
                break;
            }
            break;
          case 'stopped': {
            // Start the module
            if (debug) clog.debug(`Starting module ${ident}`);
            // Check the log path
            // Function checkCreateLogPath(ident);

            var out = null;
            var module = null;
            var instance = null;

            // Is this an instance of a module?
            if (ident.includes('.')) {
              module = ident.split('.')[0];
              instance = ident.split('.')[1];
            } else {
              module = ident;
            }
            // Try to open the log file
            try {
              // eslint-disable-next-line security/detect-non-literal-fs-filename
              out = fs.openSync(`${__dirname}/../log/${ident}.log`, 'a');
            } catch (err) {
              return reject(
                new Error({
                  message: 'Unable to open log file',
                  code: 'E_LOG_ERR',
                }),
              );
            }

            // Fork off the child process
            var child = null;
            try {
              const filename = module.replace('-', '/');
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
              return reject(err);
            }
            // Wait for the child to tell us that it is ready
            child.on('message', (message) => {
              if (message === 'ready') {
                const moduleStatus = {
                  ident: ident,
                  pid: child.pid,
                  status: 'running',
                  pidFileStatus: 'unknown',
                };
                // Say goodbye!
                child.removeAllListeners();
                child.disconnect();
                child.unref();
                return resolve(moduleStatus);
              } else if (message === 'fail') {
                // If the child reports a startup failure
                const moduleStatus = {
                  ident: ident,
                  pid: child.pid,
                  status: 'failed',
                  pidFileStatus: 'unknown',
                };
                // Hopefully the caller knows what to do with this
                return resolve(moduleStatus);
              }
            });
          }
        }
        return;
      })
      .catch((err) => {
        return reject(err);
      });
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

export function botStatus(ipc) {
  var runningModules = [];
  return new Promise((resolve, reject) => {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const files = fs.readdirSync(`${procPath}/proc`);
      files.forEach((file) => {
        clog.debug(file);
        var moduleName = file.replace('.pid', '');
        moduleStatus(ipc, moduleName)
          .then((result) => {
            clog.debug('result:', result);
            runningModules.push(result);
            // eslint-disable-next-line prettier/prettier
            if (runningModules.length == files.length) {
              return resolve(runningModules);
            }
            return;
          })
          .catch((err) => {
            return reject(err);
          });
      });
    } catch (err) {
      return reject(err);
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

// Returns a promise that is resolved when we know what's up with the module
/* Return format:
const status = {
  ident: ident,
  pid: pid,
  status: ['running', 'stopped', 'unknown'],
  pidFileStatus: ['valid', 'invalid', 'stale', 'missing']
}
*/
export function moduleStatus(ipc, ident) {
  checkProcPath();
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
      // First, set a timeout to give up on a ping reply after 5 seconds
      const timeout = setTimeout(() => {
        // If the pid file is invalid
        if (pidFileData.toString() === 'NaN') {
          status.status = 'stopped';
          status.pidFileStatus = 'invalid';
          return resolve(status);
        } else if (typeof pidFileData === 'number') {
          if (pidIsRunning(pidFileData)) {
            status.status = 'unresponsive';
            status.pidFileStatus = 'stale';
            return resolve(status);
          } else {
            status.pid = pidFileData;
            status.status = 'stopped';
            status.pidFileStatus = 'stale';
            return resolve(status);
          }
        }
      }, 2000);

      // Build the ping request
      const requestId = genMessageID();
      const pingRequest = {
        requestId: requestId,
        replyTo: `eevee-pm.pong`,
      };
      if (debug) clog.debug(`ping request: ${JSON.stringify(pingRequest)}`);

      // Subscribe to a ping reply
      ipc.subscribe(`eevee-pm.pong`, (data) => {
        const pingReply = JSON.parse(data);
        if (debug) clog.debug('Ping reply received:', pingReply);
        if (pingReply.requestId === requestId) {
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
          if (debug) clog.debug(status);
          return resolve(status);
        }
      });
      // Send the ping out
      ipc.publish(`${ident}.ping`, JSON.stringify(pingRequest));
    });
  });
}

// Checks if a number is a valid pid
export function pidIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return false;
  }
}
