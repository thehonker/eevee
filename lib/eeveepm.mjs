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

export function moduleStart(ipc, ident, args) {
  if (debug) clog.debug('Function moduleStart(ident, args) args:', ident, args);
  checkProcPath();
  // Check if module is running
  return new Promise((resolve, reject) => {
    moduleStatus(ipc, ident)
      .then((result) => {
        var err = null;
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

export function moduleStop(ipc, ident, args) {
  if (debug) clog.debug('Function moduleStop(ident, args) args:', ident, args);
  checkProcPath();

  // Check if module is running
  return new Promise((resolve, reject) => {
    moduleStatus(ipc, ident)
      .then((result) => {
        if (debug) clog.debug(result);
        if (result.status === 'running' && result.pidFileStatus === 'valid') {
          try {
            process.kill(result.pid, 'SIGINT');
            const moduleStatus = {
              ident: ident,
              pid: null,
              status: 'stopped',
              pidFileStatus: 'unknown',
            };

            return resolve(moduleStatus);
          } catch (err) {
            return reject(err);
          }
        }
        return;
      })
      .catch((err) => {
        return reject(err);
      });
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
