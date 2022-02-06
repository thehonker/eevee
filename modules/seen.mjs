'use strict';

// Seen module. Saves the last line it heard from a user

const ident = 'seen';

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { default as sqlite3 } from 'better-sqlite3';

import { ipc, lockPidFile, handleSIGINT, getConfig, getDirName, setPingListener } from '../lib/common.mjs';

// Globals
const debug = true;
var db = null;

// Yay es6
const __dirname = getDirName();

lockPidFile(ident);

setPingListener(ipc, ident, 'init');

// Pull in our config
const config = getConfig(ident);
if (debug) clog.debug('Config', config);

const help = [
  {
    command: 'seen',
    descr: 'Last Seen command',
    params: [
      {
        param: 'user',
        required: true,
        descr: 'The user to look for',
      },
    ],
  },
];

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
  ipc.publish(
    '_help.update',
    JSON.stringify({
      from: ident,
      help: help,
    }),
  );
  setPingListener(ipc, ident, 'running');
});

process.on('SIGINT', () => {
  // Close DB connection
  db.close();
  // Common handler
  handleSIGINT(ident, ipc);
});

ipc.subscribe('_help.updateRequest', () => {
  ipc.publish(
    '_help.update',
    JSON.stringify({
      from: ident,
      help: help,
    }),
  );
});

// Check / Create DB
// Check / Create DB
const tableName = 'seen';
try {
  const createTableString = `
    CREATE TABLE IF NOT EXISTS '${tableName}' (
      'nick' varchar(255) PRIMARY KEY,
      'date' varchar(255),
      'text' varchar(255)
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
  clog.error('Error in Create/Check seen table', err);
  setPingListener(ipc, ident, 'error');
  // Close DB connection
  db.close();
  // Run common handler
  handleSIGINT(ident, ipc);
}

const dbFindUserText = db.prepare(`SELECT * FROM '${tableName}' WHERE nick = @nick ORDER BY date DESC LIMIT 1;`);

const dbSetUpdateUserText = db.prepare(
  `INSERT INTO ${tableName} (
    nick,
    date,
    text
  )
  VALUES (
    @nick,
    @date,
    @text
  )
  ON CONFLICT (nick) DO UPDATE SET 
    date = @date, 
    text = @text
`,
);

// Retrieve last line from user
ipc.subscribe('seen.request', (data) => {
  const request = JSON.parse(data);
  if (debug) clog.debug('Seen request received:', request);
  var displayTarget = request.args.split(' ')[0];
  const target = request.args.split(' ')[0].toLowerCase();

  const line = dbFindUserText.get({ nick: target });

  if (line) {
    const dateMs = parseInt(line.date);
    const date = new Date(dateMs);
    const displayDate = ircColor.green(date.toISOString().substring(0, 10));
    const displayTime = ircColor.green(date.toISOString().substring(11, 16));
    displayTarget = ircColor.red(displayTarget);
    const text = ircColor.blue(line.text);
    const reply = {
      target: request.channel,
      text: `[${displayTarget}] [${displayDate} ${displayTime}] [${text}]`,
    };
    if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
    return;
  } else {
    const reply = {
      target: request.channel,
      text: `I haven't seen ${target} yet`,
    };
    if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
    return;
  }
});

// Listen for new lines
ipc.subscribe('_broadcast.incomingMessage.#', (data) => {
  const request = JSON.parse(data);
  if (debug) clog.debug(`Got line`, request);
  setUpdateUserLine(request.nick, request.time, request.text)
    .then((dbInsertResult) => {
      if (debug) clog.debug(dbInsertResult);
      return;
    })
    .catch((err) => {
      clog.error(err);
      return;
    });
});

function setUpdateUserLine(nick, date, text) {
  return new Promise((resolve, reject) => {
    const insert = {
      nick: nick.toLowerCase(),
      date: Date.parse(date),
      text: text,
    };
    const dbInsertResult = dbSetUpdateUserText.run(insert);
    return resolve(dbInsertResult);
  });
}
