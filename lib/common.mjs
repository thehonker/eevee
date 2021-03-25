'use strict';

// All modules will use this stuff
// Sets up the IPC connection, pid file, and baseline SIGINT handling

import { fileURLToPath } from 'url';

import { default as qfsq } from 'qlobber-fsq';
import { default as lock } from 'lockfile';
import { default as clog } from 'ee-log';
import { default as hjson } from 'hjson';

// Kilobytes count!
// 'fs'
import { existsSync as fs__existsSync } from 'fs';
import { mkdirSync as fs__mkdirSync } from 'fs';
import { writeFileSync as fs__writeFileSync } from 'fs';
import { readFileSync as fs__readFileSync } from 'fs';
const fs = {
  existsSync: fs__existsSync,
  mkdirSync: fs__mkdirSync,
  writeFileSync: fs__writeFileSync,
  readFileSync: fs__readFileSync,
};

// 'path'
import { dirname as path__dirname } from 'path';
import { normalize as path__normalize } from 'path';
const path = {
  dirname: path__dirname,
  normalize: path__normalize,
};

const globalConfig = getGlobalConfig();
const procPath = globalConfig.procPath;

export const ipc = new qfsq.QlobberFSQ({ fsq_dir: `${procPath}/ipc` });

export const __dirname = getDirName();

export function lockPidFile(ident) {
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
    clog.error(`[${ident}] Could not create proc directory at ${procPath}`, err);
    if (err) throw new Error(`Could not create proc directory at ${procPath}`);
  }

  lock.lock(`${procPath}/proc/${ident}.pid`, (err) => {
    if (err) throw new Error(`Unable to acquire lock ${procPath}/proc/${ident}.pid (Process already running?)`, err);
  });
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(`${procPath}/proc/${ident}.pid`, process.pid.toString(), 'utf8');
}

export function unlockPidFile(ident) {
  lock.unlock(`${procPath}/proc/${ident}.pid`, (err) => {
    if (err) throw new Error(`Unable to unlock ${procPath}/proc/${ident}.pid`, err);
  });
}

export function handleSIGINT(ident, ipc) {
  console.log('\nReceived SIGINT, cleaning up... (repeat to force)');
  process.removeAllListeners('SIGINT');
  process.on('SIGINT', () => {
    throw new Error('Received SIGINT twice, forcing exit.');
  });
  setTimeout(() => {
    throw new Error('Timeout expired, forcing exit.');
  }, 5000).unref();
  ipc.unsubscribe();
  ipc.stop_watching();
  ipc.removeAllListeners();
  lock.unlockSync(`${procPath}/proc/${ident}.pid`);
  setTimeout(() => {
    process.exitCode = 0;
  }, 500);
}

export function exit(ident, code) {
  setTimeout(() => {
    throw new Error('Timeout expired, forcing exit.');
  }, 5000).unref();
  ipc.unsubscribe();
  ipc.stop_watching();
  ipc.removeAllListeners();
  process.removeAllListeners();
  unlockPidFile(ident);
  code ? (process.exitCode = code) : (process.exitCode = 0);
}

// Generate a random (not cryptographically random) message ID used for tracking.
export function genMessageID() {
  const charset = 'ABCDEF0123456789';
  const N = 8;
  const id = Array(N)
    .join() // Don't ask...
    .split(',') // No really, don't
    .map(() => {
      return charset.charAt(Math.floor(Math.random() * charset.length));
    })
    .join('');
  return id;
}

// Because we're es6 we have to generate __dirname ourselves
export function getDirName() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return __dirname;
}

// __filename too
export function getFileName() {
  const __filename = fileURLToPath(import.meta.url);
  return __filename;
}

export function getGlobalConfig() {
  const __dirname = getDirName();
  const configPath = path.normalize(`${__dirname}/../etc/global.hjson`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  var config = fs.readFileSync(configPath, 'utf8');
  config = hjson.parse(config);
  return config;
}

// TODO: fix multi-instance config file loading
// TODO: fail gracefully and provide global config if no config file
export function getConfig(moduleFullIdent) {
  const __dirname = getDirName();
  const moduleIdent = moduleFullIdent.split('.')[0];
  const moduleInstance = moduleFullIdent.split('.')[1];
  var moduleFilePath = null;
  if (moduleIdent.includes('-')) {
    const moduleDir = moduleIdent.split('-')[0];
    moduleFilePath = path.normalize(`${__dirname}/../etc/${moduleDir}/${moduleInstance}.hjson`);
  } else {
    moduleFilePath = path.normalize(`${__dirname}/../etc/${moduleIdent}.hjson`);
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  var config = fs.readFileSync(moduleFilePath, 'utf8');
  config = hjson.parse(config);
  config.global = getGlobalConfig();
  return config;
}

export function arrayObjectExists(array, key, value) {
  return array.some((element) => {
    // eslint-disable-next-line security/detect-object-injection
    return element[key] === value;
  });
}

export function sleep(ms) {
  return new Promise((resolve) => {
    return setTimeout(resolve, ms);
  });
}

export function readableTime(date) {
  var time = Date.now() - Date.parse(date);
  var days = Math.floor(time / 86400000);
  var hours = Math.floor(time / 3600000) - days * 24;
  var minutes = Math.floor(time / 60000) - hours * 60 - days * 1440;
  var readable = '';
  if (time < 60000) {
    readable = 'less than a minute';
  } else {
    // Fuck yeah nested ternary operators. Unreadable as hell
    days = days == 0 ? '' : days == 1 ? days + ' day' : days + ' days';
    hours = hours == 0 ? '' : hours == 1 ? hours + ' hour' : hours + ' hours';
    minutes = minutes == 0 ? '' : minutes == 1 ? minutes + ' minute' : minutes + ' minutes';

    if (days != '') {
      days +=
        hours != '' && minutes != ''
          ? ', '
          : (hours == '' && minutes != '') || (hours != '' && minutes == '')
          ? ' and '
          : '';
    }
    if (hours != '' && minutes != '') {
      hours += ' and ';
    }
    readable = days + hours + minutes;
  }
  return readable;
}
