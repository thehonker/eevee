'use strict';

// LastFM module. Gets your currently/last played entry from lastfm and displays it.

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { ipc, lockPidFile, handleSIGINT, getConfig, getDirName } from '../lib/common.mjs';
import { default as sqlite3 } from 'better-sqlite3';

const debug = true;
var db = null;

const __dirname = getDirName();

var moduleIdent = 'lastfm';
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

// Check / Create DB
var tableName = 'lastfm';
if (moduleInstance) {
  tableName = `lastfm-${moduleInstance}`;
}
try {
  var createTableString = `
    CREATE TABLE IF NOT EXISTS '${tableName}' (
      'index' integer PRIMARY KEY AUTOINCREMENT,
      'id' varchar(255),
      'dateSent' timestamp,
      'fromConnector' varchar(255),
      'fromChannel' varchar(255),
      'fromIdent' varchar(255),
      'fromUser' varchar(255),
      'toUser' varchar(255),
      'platform' varchar(255),
      'message' text,
      'pm' boolean,
      'delivered' timestamp
    );
  `;

  db = new sqlite3(`${__dirname}/../db/${config.dbFilename}`, {
    readonly: config.dbParameters.readonly,
    fileMustExist: config.dbParameters.fileMustExist,
    timeout: config.dbParameters.timeout,
    verbose: console.log,
  });

  const createTablePrepared = db.prepare(createTableString);
  const createTableResult = createTablePrepared.run();
  if (debug) clog.debug(createTableResult.changes);
} catch (err) {
  clog.error('Error in Create/Check tell table', err);
}
