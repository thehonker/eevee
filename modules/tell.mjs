'use strict';

// Tell module. Fancy text-based answering machine.

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { ipc, lockPidFile, handleSIGINT, getConfig, getDirName } from '../lib/common.mjs';
import { default as sqlite3 } from 'better-sqlite3';

const debug = true;
var db = null;

const __dirname = getDirName();

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

// Check / Create DB
var tableName = 'tell';
if (moduleInstance) {
  tableName = `tell-${moduleInstance}`;
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
      'delivered' boolean,
      'dateDelivered' timestamp
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

const addTell = db.prepare(
  `INSERT INTO ${tableName} (id, dateSent, fromConnector, fromChannel, fromIdent, fromUser, toUser, platform, message, pm, delivered, dateDelivered)
   VALUES (@id, @dateSent, @fromConnector, @fromChannel, @fromIdent, @fromUser, @toUser, @platform, @message, @pm, @delivered, @dateDelivered)`,
);

const findTellByUser = db.prepare(`SELECT * FROM '${tableName}' WHERE toUser = @toUser`);
const markAsDelivered = db.prepare(`UPDATE '${tableName}' SET dateDelivered = @date, delivered = 1 WHERE id = @id`);
const removeTellByID = db.prepare(`DELETE FROM '${tableName}' WHERE id = @id`);

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

// Handle incoming tell's
ipc.subscribe('tell.request', (data) => {
  const request = JSON.parse(data);
  if (debug) clog.debug('Tell request received', request);

  const toUser = request.args.split(' ')[0];
  const message = request.args
    .split(' ')
    .slice(1)
    .join(' ');

  const newTellData = {
    id: request.id,
    dateSent: new Date().toISOString(),
    fromConnector: request.replyTo,
    fromChannel: request.channel,
    fromIdent: request.ident,
    fromUser: request.nick,
    toUser: toUser,
    platform: request.platform,
    message: message,
    pm: 0,
    delivered: 0,
    dateDelivered: null,
  };

  var replyText = null;
  try {
    addTell.run(newTellData);
  } catch (err) {
    replyText = `Saving message ${data.id} failed! ${err.message}`;
    if (request.platform === 'irc') {
      replyText = ircColor.red(`Saving message ${data.id} failed! ${err.message}`);
    }
    const reply = {
      target: request.channel,
      text: replyText,
    };
    if (debug) clog.debug('Sending fail message', reply);
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
    return;
  }
  replyText = `Message to ${toUser} saved! (ID: ${data.id})`;
  if (request.platform === 'irc') {
    replyText = ircColor.green(`Message to ${toUser} saved! (ID: ${request.id})`);
  }
  const reply = {
    target: request.channel,
    text: replyText,
  };
  if (debug) clog.debug('Sending ack message', reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});

// Listen for when people say things
ipc.subscribe('broadcast.incomingMessage.#', (data) => {
  data = JSON.parse(data);
  if (debug) clog.debug(`Checking if user ${data.nick} has any tells`);
  const tells = findTellByUser.all({ toUser: data.nick });
  if (tells.length) {
    if (debug) clog.debug(`Found tells for user ${data.nick}`, tells);
    tells.forEach((tell) => {
      if (tell.delivered === 0) {
        var replyText = `${data.nick}: ${`Message from ${tell.fromUser}, ${readableTime(tell.dateSent)}`}: ${tell.message}`;
        if (tell.platform === 'irc') {
          // eslint-disable-next-line prettier/prettier
          replyText = `${data.nick}: ${ircColor.blue(`Message from ${tell.fromUser}, ${readableTime(tell.dateSent)}`)}: ${tell.message}`;
        }
        let reply = {
          target: tell.fromChannel,
          text: replyText,
        };
        ipc.publish(`${tell.fromConnector}.outgoingMessage`, JSON.stringify(reply));
        markAsDelivered.run({
          date: new Date().toISOString(),
          id: tell.id,
        });
      }
    });
  }
});

const readableTime = function(date) {
  var time = Date.now() - Date.parse(date);
  var days = Math.floor(time / 86400000);
  var hours = Math.floor(time / 3600000) - days * 24;
  var minutes = Math.floor(time / 60000) - hours * 60 - days * 1440;
  var readable = '';
  if (time < 60000) {
    readable = 'less than a minute';
  } else {
    //Fuck yeah nested ternary operators. Unreadable as hell
    days = days == 0 ? '' : days == 1 ? days + ' day' : days + ' days';
    hours = hours == 0 ? '' : hours == 1 ? hours + ' hour' : hours + ' hours';
    minutes = minutes == 0 ? '' : minutes == 1 ? minutes + ' minute' : minutes + ' minutes';

    if (days != '') {
      days +=
        hours != '' && minutes != ''
          ? ', '
          : (hours == '' && minutes != '') || (hours != '' && minutes == '')
          ? ' and '
          : '';
    }
    if (hours != '' && minutes != '') {
      hours += ' and ';
    }
    readable = days + hours + minutes;
  }
  return readable + ' ago';
};
