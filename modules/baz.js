'use strict';

const clog = require('ee-log');
const nrp = require('node-redis-pubsub');

const ipc = new nrp({
  port: 6379,
  scope: 'helloworld',
});

ipc.on('baz:c', (data) => {
  clog.error('baz:c received:');
});

ipc.on('baz:*', (data) => {
  clog.info('baz:* received:');
  ipc.emit('bar:a', {
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

const sendInterval = setInterval(() => {
  ipc.emit('foo:z', {
    hello: 'world',
    foo: 'bar',
    baz: 'ddd',
    fizz: 'buzz',
    a: 'b',
    f: false,
    nu: null,
    twentyseven: 27,
  });
}, 5000);

process.on('SIGINT', () => {
  console.log('SIGINT received');
  ipc.quit();
  clearInterval(sendInterval);
  process.exitCode = 0;
});

process.send('ready');