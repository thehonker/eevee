'use strict';
const fs = require('fs');

exports.tmpDirTest = function () {
  if (!fs.existsSync('/tmp/eevee/')) {
    fs.mkdirSync('/tmp/eevee/');
  }
  if (!fs.existsSync('/tmp/eevee/proc/')) {
    fs.mkdirSync('/tmp/eevee/proc/');
  }
  if (!fs.existsSync('/tmp/eevee/ipc')) {
    fs.mkdirSync('/tmp/eevee/ipc');
  }
};

exports._SIGINT = function(ident, ipc, lock) {
  console.log('Received SIGINT, cleaning up...  (repeat to force exit)');
  process.removeAllListeners('SIGINT');
  process.on('SIGINT', () => {
    throw new Error('Received SIGINT twice, forcing exit.');
  });
  setTimeout(() => {
    throw new Error('Timeout expired after SIGINT, forcing exit.');
  }, 5000);
  ipc.publish('global.psinfo', `${ident}: SIGINT received`);
  ipc.unsubscribe();
  ipc.stop_watching();
  ipc.removeAllListeners();
  lock.unlock(`/tmp/eevee/proc/${ident}.pid`, (err) => {
    if (err) throw new Error(err);
  });
  process.exitCode = 0;
};
