'use strict';

// Tell module. Fancy text-based answering machine.

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { ipc, lockPidFile, handleSIGINT, getConfig, getDirName } from '../lib/common.mjs';
import { default as sqlite3 } from 'better-sqlite3';

const __dirname = getDirName();

var moduleFullIdent = 'tell';

const config = getConfig(moduleFullIdent);

const db = new sqlite3(`${__dirname}/../db/${config.dbFilename}`, {
  readonly: config.dbParameters.readonly,
  fileMustExist: config.dbParameters.fileMustExist,
  timeout: config.dbParameters.timeout,
  verbose: console.log,
});

// Wait 10 seconds then dump everything
setInterval(() => {
  let selectStatement = db.prepare(`SELECT * FROM 'tell'`);
  let output = selectStatement.all({
    toUser: 'foo',
  });
  clog.debug(output);
}, 5000);
