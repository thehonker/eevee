'use strict';

// LastFM module. Gets your currently/last played entry from lastfm and displays it.

// Imports
import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { default as sqlite3 } from 'better-sqlite3';
import { default as needle } from 'needle';

import { ipc, lockPidFile, handleSIGINT, getConfig, getDirName, addPingListener } from '../lib/common.mjs';

// Globals
const debug = true;
var db = null;

// Yay es6
const __dirname = getDirName();

// Module ident / instance logic
var moduleIdent = 'lastfm';
var moduleInstance = null;
var moduleFullIdent = moduleIdent;
if (process.argv[2] === '--instance' && process.argv[3]) {
  moduleInstance = process.argv[3];
  moduleFullIdent = moduleIdent + '.' + moduleInstance;
  if (debug) clog.debug(`My moduleFullIdent is: ${moduleFullIdent}`);
}

// Create our lock/pid file
lockPidFile(moduleFullIdent);

addPingListener(ipc, moduleFullIdent);

// Pull in our config
const config = getConfig(moduleFullIdent);
if (debug) clog.debug('Config', config);

// Once IPC is connected, tell our parent process that we're ready
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
});

// Handle SIGINT
process.on('SIGINT', () => {
  // Close DB connection
  db.close();
  // Run common handler
  handleSIGINT(moduleFullIdent, ipc);
});

// End boilerplate

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
      'dateSet' timestamp,
      'fromConnector' varchar(255),
      'fromChannel' varchar(255),
      'userIdent' varchar(255),
      'nick' varchar(255),
      'lastfmUser' varchar(255),
      'platform' varchar(255)
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
  clog.error('Error in Create/Check lastfm table', err);
}

const addLastfmUser = db.prepare(
  `INSERT INTO ${tableName} (id, dateSet, fromConnector, fromChannel, nick, userIdent, lastfmUser, platform)
   VALUES (@id, @dateSet, @fromConnector, @fromChannel, @nick, @userIdent, @lastfmUser, @platform);`,
);

const findLastfmUser = db.prepare(`SELECT * FROM '${tableName}' WHERE nick = @nick ORDER BY dateSet DESC;`);

ipc.subscribe('lastfm.request', (data) => {
  lastfm(data);
});

ipc.subscribe('fm.request', (data) => {
  lastfm(data);
});

function lastfm(data) {
  const request = JSON.parse(data);
  if (debug) clog.debug('lastfm request received:', request);

  // Is there an argument to the command?
  if (request.args.split(' ')[0] != '') {
    let insert = {
      id: request.id,
      dateSet: new Date().toISOString(),
      fromConnector: request.replyTo,
      fromChannel: request.channel,
      userIdent: request.ident,
      nick: request.nick,
      lastfmUser: request.args.split(' ')[0],
      platform: request.platform,
    };
    addLastfmUser.run(insert);
  }
  const query = findLastfmUser.get({ nick: request.nick });

  if (debug) clog.debug('LastFM User found:', query.lastfmUser);

  const apiUrl = `http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${query.lastfmUser}&api_key=${config.apiKey}&format=json`;
  needle.get(apiUrl, (err, response) => {
    if (debug) clog.debug('LastFM response', response);
    if (debug) clog.debug('Last played track', response.body.recenttracks.track[0]);

    const track = response.body.recenttracks.track[0];
    const artist = track.artist['#text'];
    const album = track.album['#text'];
    const title = track.name;

    // eslint-disable-next-line prettier/prettier
    var replyText = `${request.nick} is listening to: ${artist} - ${title}${( (album) ? ('(' + album + ')') : '' )}`;
    if (request.platform === 'irc') {
      // eslint-disable-next-line prettier/prettier
      replyText = `${request.nick} is listening to: ${ircColor.cyan(artist)} - ${ircColor.red(title)}${( (album) ? (' (' + ircColor.brown(album) + ')') : '' )}`;
    }
    let reply = {
      target: request.channel,
      text: replyText,
    };
    if (debug) clog.debug(reply);
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  });
}
