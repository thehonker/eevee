'use strict';

// LastFM module. Gets your currently/last played entry from lastfm and displays it.

// Imports
import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { default as sqlite3 } from 'better-sqlite3';
import { default as needle } from 'needle';
import { default as imgur } from 'imgur';

import { ipc, lockPidFile, handleSIGINT, getConfig, getDirName, setPingListener } from '../lib/common.mjs';

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

setPingListener(ipc, moduleFullIdent, 'init');

// Pull in our config
const config = getConfig(moduleFullIdent);
if (debug) clog.debug('Config', config);

const help = [
  {
    command: 'lastfm',
    descr: 'Retrieve latest from lastfm, optionally setting username',
    params: [
      {
        param: 'lastfm_username',
        required: false,
        descr: 'If provided will set/update lastfm username',
      },
    ],
  },
  {
    command: 'fm',
    descr: 'Alias to lastfm command',
    params: [],
  },
  {
    command: 'lastfm3x3',
    descr: 'Retrieve a 7-day 3x3 from tapmusic.net/lastfm',
    params: [],
  },
];

// Once IPC is connected, tell our parent process that we're ready
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
  ipc.publish(
    '_help.update',
    JSON.stringify({
      from: moduleFullIdent,
      help: help,
    }),
  );
});

// Handle SIGINT
process.on('SIGINT', () => {
  // Close DB connection
  db.close();
  // Run common handler
  handleSIGINT(moduleFullIdent, ipc);
});

ipc.subscribe('_help.updateRequest', () => {
  ipc.publish(
    '_help.update',
    JSON.stringify({
      from: moduleFullIdent,
      help: help,
    }),
  );
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
  setPingListener(ipc, moduleFullIdent, 'error');
}

const addLastfmUser = db.prepare(
  `INSERT INTO ${tableName} (id, dateSet, fromConnector, fromChannel, nick, userIdent, lastfmUser, platform)
   VALUES (@id, @dateSet, @fromConnector, @fromChannel, @nick, @userIdent, @lastfmUser, @platform);`,
);

const findLastfmUser = db.prepare(`SELECT * FROM '${tableName}' WHERE nick = @nick ORDER BY dateSet DESC;`);

setPingListener(ipc, moduleFullIdent, 'running');

ipc.subscribe('lastfm.request', (data) => {
  lastfm(data);
});

ipc.subscribe('fm.request', (data) => {
  lastfm(data);
});

ipc.subscribe('lastfm3x3.request', (data) => {
  lastfm3x3(data);
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

  if (query) {
    if (debug) clog.debug('LastFM User found:', query.lastfmUser);

    const apiUrl = `http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${query.lastfmUser}&api_key=${config.apiKey}&format=json`;
    needle('get', apiUrl)
      .then((response) => {
        if (response.body) {
          if (debug) clog.debug('LastFM response', response);
          if (debug) clog.debug('Last played track', response.body.recenttracks.track[0]);

          const track = response.body.recenttracks.track[0];
          const artist = track.artist['#text'];
          const album = track.album['#text'];
          const title = track.name;
          const url = track.url;

          // eslint-disable-next-line prettier/prettier
          var replyText = `${request.nick} is listening to: [ ${artist} - ${title} ]${( (album) ? ('[ ' + album + ' ]') : '' )}[ ${url} ]`;
          if (request.platform === 'irc') {
            // eslint-disable-next-line prettier/prettier
            replyText = `${request.nick} is listening to: [ ${ircColor.cyan(artist)} - ${ircColor.red(title)} ]${( (album) ? ('[ ' + ircColor.green(album) + ' ]') : '' )}[ ${ircColor.blue(url)} ]`;
          }
          const reply = {
            target: request.channel,
            text: replyText,
          };
          if (debug) clog.debug(reply);
          ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
          return;
        } else {
          const reply = {
            target: request.channel,
            text: 'Error fetching lastfm data',
          };
          if (debug) clog.debug(reply);
          ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        }
        return;
      })
      .catch((err) => {
        clog.error(err);
        return;
      });
  } else {
    const reply = {
      target: request.channel,
      text: 'You need to set a lastfm username',
    };
    if (debug) clog.debug(reply);
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  }
}

function lastfm3x3(data) {
  const request = JSON.parse(data);
  if (debug) clog.debug('lastfm request received:', request);

  const query = findLastfmUser.get({ nick: request.nick });

  if (query) {
    const tapMusicUrl = `https://tapmusic.net/lastfm/collage.php?user=${query.lastfmUser}&type=7day&size=3x3&caption=true`;
    if (debug) clog.debug(tapMusicUrl);

    imgur
      .uploadUrl(tapMusicUrl)
      .then((response) => {
        const reply = {
          target: request.channel,
          text: response.link,
        };
        if (debug) clog.debug(reply);
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        return;
      })
      .catch((err) => {
        clog.debug(err);
        return;
      });
  } else {
    const reply = {
      target: request.channel,
      text: 'You need to set a lastfm username',
    };
    if (debug) clog.debug(reply);
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  }
}
