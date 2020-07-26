'use strict';

// Tell module. Fancy text-based answering machine.

const ident = 'tell';
const debug = true;

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { ipc, lockPidFile, handleSIGINT } from '../lib/common.mjs';

lockPidFile(ident);

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
  handleSIGINT(ident, ipc);
});

// Check / Create DB

// Handle incoming tell's
ipc.subscribe('tell.request', (data) => {
  // Function: newTell(data);
  // Stick them into sqlite3 db
});

// Listen for when people say things
// Query the DB for tells in their name
// Give them their messages
// Once someone has been heard from, don't check them again for X minutes

// That's it really
// Idea: "tellpref" - do you want your tell's in channel or in pm?
