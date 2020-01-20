'use strict';

const clog = require('ee-log');
const nrp = require('node-redis-pubsub');

const ipc = new nrp({
  port: 6379,
  scope: 'helloworld',
});

ipc.on('bar:b', (data) => {
  clog.error('bar:b received:');
});

ipc.on('bar:*', (data) => {
  clog.info('bar:* received:');
  ipc.emit('baz:c', {
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
  ipc.emit('baz:y', {
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
