'use strict';

// All modules will use this stuff
// Sets up the IPC connection, pid file, and baseline SIGINT handling

import { fileURLToPath } from 'url';
import { default as path } from 'path';
import { default as qfsq } from 'qlobber-fsq';
import { default as lock } from 'lockfile';
import { default as clog } from 'ee-log';
import { default as hjson } from 'hjson';

// Kilobytes count!
import { existsSync as __existsSync } from 'fs';
import { mkdirSync as __mkdirSync } from 'fs';
import { writeFileSync as __writeFileSync } from 'fs';
import { readFileSync as __readFileSync } from 'fs';
// We do this song and dance to make eslint give a shit
const fs = {
  existsSync: __existsSync,
  mkdirSync: __mkdirSync,
  writeFileSync: __writeFileSync,
  readFileSync: __readFileSync,
};

const globalConfig = getGlobalConfig();
const procPath = globalConfig.procPath;

export const ipc = new qfsq.QlobberFSQ({ fsq_dir: `${procPath}/ipc` });

export const dirname = getDirName();

export function lockPidFile(ident) {
  try {
    if (!fs.existsSync(`${procPath}/proc`)) {
      fs.mkdirSync(`${procPath}/proc`, { recursive: true });
    }
    if (!fs.existsSync(`${procPath}/ipc`)) {
      fs.mkdirSync(`${procPath}/ipc`, { recursive: true });
    }
  } catch (err) {
    clog.error(`[${ident}] Could not create proc directory at ${procPath}`, err);
    if (err) throw new Error(`Could not create proc directory at ${procPath}`);
  }

  lock.lock(`${procPath}/proc/${ident}.pid`, (err) => {
    if (err) throw new Error(`Unable to acquire lock ${procPath}/proc/${ident}.pid (Process already running?)`, err);
  });
  fs.writeFileSync(`${procPath}/proc/${ident}.pid`, process.pid.toString(), 'utf8');
}

export function unlockPidFile(ident) {
  lock.unlock(`${procPath}/proc/${ident}.pid`, (err) => {
    if (err) throw new Error(`Unable to acquire lock ${procPath}/proc/${ident}.pid (Process already running?)`, err);
  });
}

export function handleSIGINT(ident, ipc, debug) {
  if (debug) console.log('\nReceived SIGINT, cleaning up... (repeat to force)');
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
  process.exitCode = 0;
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

export function genMessageID() {
  const charset = 'ABCDEF0123456789';
  const N = 8;
  const id = Array(N)
    .map(() => {
      return charset.charAt(Math.floor(Math.random() * charset.length));
    })
    .join('');
  return id;
}

export function getDirName() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return __dirname;
}

export function getGlobalConfig() {
  const __dirname = getDirName();
  const configPath = path.normalize(`${__dirname}/../etc/global.hjson`);
  var config = fs.readFileSync(configPath, 'utf8');
  config = hjson.parse(config);
  return config;
}

export function getConfig(moduleFullIdent) {
  const __dirname = getDirName();
  const moduleIdent = moduleFullIdent.split('@')[0];
  const moduleInstance = moduleFullIdent.split('@')[1];
  var moduleFilePath = null;
  if (moduleIdent.includes('-')) {
    const moduleDir = moduleIdent.split('-')[0];
    moduleFilePath = path.normalize(`${__dirname}/../etc/${moduleDir}/${moduleInstance}.hjson`);
  } else {
    moduleFilePath = path.normalize(`${__dirname}/../etc/${moduleIdent}.hjson`);
  }
  var config = fs.readFileSync(moduleFilePath, 'utf8');
  config = hjson.parse(config);
  config.global = getGlobalConfig();
  return config;
}
