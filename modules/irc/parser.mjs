'use strict';

// Irc-parser. Takes messages from irc-connector, parses & filters them, and passes them on to modules

const ident = 'irc-parser';
const debug = true;

import { default as clog } from 'ee-log';
import { default as fs } from 'fs';
import { default as hjson } from 'hjson';
import path from 'path';

import { ipc, lockPidFile, handleSIGINT, genMessageID, __dirname } from '../../lib/common.mjs';

var moduleIdent = 'irc-connector';
var moduleInstance = null;
var moduleFullIdent = moduleIdent;

clog.debug(process.argv);

if (process.argv[2] === '--instance') {
  moduleInstance = process.argv[3];
  moduleFullIdent = moduleIdent + '@' + moduleInstance;
}

lockPidFile(moduleFullIdent);

const configPath = path.normalize(`${__dirname}/../../etc/irc/${moduleInstance}.hjson`);
// eslint-disable-next-line security/detect-non-literal-fs-filename
var config = fs.readFileSync(configPath, 'utf8');
config = hjson.parse(config);

if (debug) clog.debug('Configuration: ', config);

// Print every message we receive if debug is enabled
if (debug) {
  ipc.subscribe(`${ident}.#`, (data, info) => {
    clog.debug('incoming IPC message: ', info, data.toString());
  });
}

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc, debug);
});
