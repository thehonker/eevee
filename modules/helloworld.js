'use strict';

const clog = require('ee-log');
const nrp = require('node-redis-pubsub');

const ipc = new nrp({
  port: 6379,
  scope: 'helloworld',
});

ipc.on('msg', (data) => {
  clog.error('msg received:', data);
  ipc.emit('reply', {
    foo: 'bar',
    baz: 'ddd',
    a: 'b',
    f: false,
    nu: null,
    twentyseven: 27,
  });
});

ipc.on('error', (error) => {
  clog.error('ERRORERRORERROR', error);
});

process.on('SIGINT', () => {
  ipc.removeAllListeners();
  ipc.quit();
  process.exitCode = 0;
});
