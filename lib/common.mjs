'use strict';

import * as fs from 'fs';
import { default as qfsq } from 'qlobber-fsq';
import { default as lock } from 'lockfile';

const procPath = '/tmp/eevee';

export function checkProcPath() {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(procPath)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.mkdirSync(procPath);
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(`${procPath}/proc`)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.mkdirSync(`${procPath}/proc`);
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(`${procPath}/ipc`)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.mkdirSync(`${procPath}/ipc`);
  }
}

export function lockPidFile(ident) {
  lock.lock(`${procPath}/proc/${ident}.pid`, (err) => {
    if (err) throw new Error(`Unable to acquire lock ${procPath}/proc/${ident}.pid (Process already running?)`, err);
  });
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(`${procPath}/proc/${ident}.pid`, process.pid.toString(), 'utf8');
}

export const ipc = new qfsq.QlobberFSQ({ fsq_dir: `${procPath}/ipc` });

export function handleSIGINT(ident, ipc) {
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
}
