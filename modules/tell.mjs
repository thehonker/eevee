'use strict';

// Tell module. Fancy text-based answering machine.
const debug = true;

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { ipc, lockPidFile, handleSIGINT, getConfig, genMessageID } from '../lib/common.mjs';
import { default as sqlite3 } from 'better-sqlite3';

var moduleIdent = 'tell';
var moduleInstance = null;
var moduleFullIdent = moduleIdent;
if (process.argv[2] === '--instance' && process.argv[3]) {
  moduleInstance = process.argv[3];
  moduleFullIdent = moduleIdent + '@' + moduleInstance;
  if (debug) clog.debug(`My moduleFullIdent is: ${moduleFullIdent}`);
}

lockPidFile(moduleFullIdent);

const config = getConfig(moduleFullIdent);
if (debug) clog.debug(config);

var tableName = 'tell';
if (moduleInstance) {
  tableName = `tell-${moduleInstance}`;
}

var createTableString = `
  CREATE TABLE IF NOT EXISTS '${tableName}' (
    'index' integer PRIMARY KEY AUTOINCREMENT,
    'id' varchar(255),
    'dateSent' timestamp,
    'fromConnector' varchar(255),
    'fromChannel' varchar(255),
    'fromUser' varchar(255),
    'toUser' varchar(255),
    'platform' varchar(255),
    'message' text,
    'pm' boolean,
    'delivered' timestamp
  );
`;

const db = new sqlite3(`../db/${config.dbFilename}`, {
  readonly: config.dbParameters.readonly,
  fileMustExist: config.dbParameters.fileMustExist,
  timeout: config.dbParameters.timeout,
  verbose: console.log,
});

const createTablePrepared = db.prepare(createTableString);
const createTableResult = createTablePrepared.run();
if (debug) clog.debug(createTableResult.changes);

const addTell = db.prepare(
  `INSERT INTO tells (id, dateSent, fromConnector, fromChannel, fromUser, toUser, message, pm, delivered)
   VALUES (@id, @dateSent, @fromConnector, @fromChannel, @fromUser, @toUser, @message, @pm, @delivered)`,
);

/* Turn this off
const manualTell = {
  id: genMessageID(),
  dateSent: new Date().toISOString(),
  fromConnector: 'irc-connector@wetfish',
  fromChannel: '#eevee',
  fromUser: 'Weazzy@lu.dicro.us',
  toUser: 'foo',
  message: 'bar baz fizz buzz',
  pm: 0,
  delivered: null,
};
addTell.run(manualTell);
*/

// Wait a second then dump everything
setTimeout(() => {
  let selectStatement = db.prepare(`SELECT * FROM 'tells' WHERE toUser = @toUser`);
  let output = selectStatement.all({
    toUser: 'foo',
  });
  clog.debug(output);
}, 1000);

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
  db.close();
  handleSIGINT(moduleFullIdent, ipc);
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
