'use strict';
const fs = require('fs');
const QlobberFSQ = require('qlobber-fsq').QlobberFSQ;
const lock = require('lockfile');

const procPath = '/tmp/eevee';

exports.createProcDir = function() {
  if (!fs.existsSync(procPath)) {
    fs.mkdirSync(procPath);
  }
  if (!fs.existsSync(`${procPath}/proc`)) {
    fs.mkdirSync(`${procPath}/proc`);
  }
  if (!fs.existsSync(`${procPath}/ipc`)) {
    fs.mkdirSync(`${procPath}/ipc`);
  }
  return procPath;
};

exports.ipc = function() {
  return new QlobberFSQ({ fsq_dir: `${procPath}/ipc` });
};

exports.handleSIGINT = function(ident, ipc, lock) {
  console.log('\nReceived SIGINT, cleaning up... (repeat to force)');
  process.removeAllListeners('SIGINT');
  process.on('SIGINT', () => {
    throw new Error('Received SIGINT twice, forcing exit.');
  });
  ipc.unsubscribe();
  ipc.stop_watching();
  ipc.removeAllListeners();
  lock.unlockSync(`${procPath}/proc/${ident}.pid`);
  process.exitCode = 0;
};

exports.lock = function(ident) {
  lock.lock(`${procPath}/proc/${ident}.pid`, (err) => {
    if (err) throw new Error(`Unable to acquire lock ${procPath}/proc/${ident}.pid (Process already running?)`, err);
  });
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(`${procPath}/proc/${ident}.pid`, process.pid, 'utf8');

  return lock;
};
