'use strict';

const clog = require('ee-log');
const _ipc = require('ipc-network');

const ipc = new _ipc.IpcNetwork('helloworld');
ipc.startListening();

setTimeout(() => clog.highlight('Hello World'), 500);
setTimeout(() => ipc.stopListening(), 1000);
