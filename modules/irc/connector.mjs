'use strict';

// Irc-connector. Talks to irc servers and passes messages over to irc-parser

const debug = true;

import { default as clog } from 'ee-log';
import { default as hjson } from 'hjson';
import { default as IRC } from 'irc-framework';
import { default as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ipc, lockPidFile, handleSIGINT, genMessageID } from '../../lib/common.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

var moduleIdent = 'irc-connector';
var moduleInstance = null;
var moduleFullIdent = moduleIdent;

clog.debug(process.argv);

if (process.argv[2] === '--instance') {
  moduleInstance = process.argv[3];
  moduleFullIdent = moduleIdent + '@' + moduleInstance;
}

lockPidFile(moduleFullIdent);

console.log(`Current directory: ${process.cwd()}`);

console.log(__filename);
console.log(__dirname);

console.log('PATH: ', `${__dirname}/../../etc/irc/${moduleInstance}.hjson`);

// eslint-disable-next-line security/detect-non-literal-fs-filename
var config = fs.readFileSync(`${__dirname}/../../etc/irc/${moduleInstance}.hjson`, 'utf8');
config = hjson.parse(config);

if (debug) clog.debug(config);

const client = new IRC.Client(config.client);

// Print every message we receive if debug is enabled
if (debug) {
  ipc.subscribe(`${moduleFullIdent}.#`, (data, info) => {
    clog.debug('incoming IPC message: ', info, data.toString());
  });
}

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
});

process.on('SIGINT', () => {
  client.quit('SIGINT received');
  client.removeAllListeners();
  handleSIGINT(moduleFullIdent, ipc);
});

if (debug) clog.debug('Attempting to connect to IRC server');
client.connect(config.client);

client.on('registered', () => {
  if (debug) clog.debug('Client connected.');
  // client.join('#wetfish');
  // client.say('#wetfish', 'I AM ALIVE');
});

client.on('message', (message) => {
  if (debug) clog.debug('Client message:', message);
});

client.on('error', (message) => {
  clog.error('Client error:', message);
});

client.on('raw', (message) => {
  // if (debug) clog.debug('raw message:', message);
});
