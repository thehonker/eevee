'use strict';

// Tell module. Fancy text-based answering machine.

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import {
  ipc,
  lockPidFile,
  handleSIGINT,
  getConfig,
  getDirName,
  readableTime,
  setPingListener,
} from '../lib/common.mjs';
import { default as sqlite3 } from 'better-sqlite3';

const debug = true;
var db = null;

const __dirname = getDirName();

var moduleIdent = 'tell';
var moduleInstance = null;
var moduleFullIdent = moduleIdent;
if (process.argv[2] === '--instance' && process.argv[3]) {
  moduleInstance = process.argv[3];
  moduleFullIdent = moduleIdent + '.' + moduleInstance;
  if (debug) clog.debug(`My moduleFullIdent is: ${moduleFullIdent}`);
}

lockPidFile(moduleFullIdent);

setPingListener(ipc, moduleFullIdent, 'init');

const config = getConfig(moduleFullIdent);
if (debug) clog.debug(config);

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

const findTellByUser = db.prepare(
  `SELECT * FROM '${tableName}' WHERE toUser = @toUser AND delivered = 0 ORDER BY dateSent ASC`,
);
const findTellByID = db.prepare(`SELECT * FROM '${tableName}' WHERE id = @id`);
const markAsDelivered = db.prepare(`UPDATE '${tableName}' SET dateDelivered = @date, delivered = 1 WHERE id = @id`);
const removeTellByID = db.prepare(`DELETE FROM '${tableName}' WHERE id = @id`);

setPingListener(ipc, moduleFullIdent, 'listening');

// Handle incoming tell
ipc.subscribe('tell.request', (data) => {
  setPingListener(ipc, moduleFullIdent, 'running');
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
      replyText = ircColor.red(`Saving message ${data.id} failed: ${err.message}`);
    }
    const reply = {
      target: request.channel,
      text: replyText,
    };
    if (debug) clog.debug('Sending fail message', reply);
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
    return;
  }
  replyText = `${request.nick}: Message to ${toUser} saved! (ID: ${data.id})`;
  if (request.platform === 'irc') {
    replyText = `${request.nick}: ${ircColor.green(`Message to ${toUser} saved (ID: ${request.id})`)}`;
  }
  const reply = {
    target: request.channel,
    text: replyText,
  };
  if (debug) clog.debug('Sending ack message', reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  setPingListener(ipc, moduleFullIdent, 'listening');
});

ipc.subscribe('rmtell.request', (data) => {
  setPingListener(ipc, moduleFullIdent, 'running');
  const request = JSON.parse(data);
  if (debug) clog.debug('rmtell request received', request);
  const id = request.args.split(' ')[0];
  var replyText = null;
  const tellById = findTellByID.get({ id });
  if (tellById) {
    if (request.ident === tellById.fromIdent) {
      removeTellByID.run({ id: id });
      replyText = `${request.nick}: Message with ID ${id} deleted`;
      if (request.platform === 'irc') {
        // eslint-disable-next-line prettier/prettier
        replyText = `${request.nick}: ${ircColor.blue(`Message with ID ${id} deleted`)}`;
      }
      let reply = {
        target: request.channel,
        text: replyText,
      };
      ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
    } else {
      replyText = `${request.nick}: Message with ID ${id} was not sent by you`;
      if (request.platform === 'irc') {
        // eslint-disable-next-line prettier/prettier
        replyText = `${request.nick}: ${ircColor.red(`Message with ID ${id} was not sent by you`)}`;
      }
      let reply = {
        target: request.channel,
        text: replyText,
      };
      ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
    }
  } else {
    replyText = `${request.nick}: Message with ID ${id} was not found`;
    if (request.platform === 'irc') {
      // eslint-disable-next-line prettier/prettier
      replyText = `${request.nick}: ${ircColor.red(`Message with ID ${id} was not found`)}`;
    }
    let reply = {
      target: request.channel,
      text: replyText,
    };
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
    setPingListener(ipc, moduleFullIdent, 'listening');
  }
});

// Listen for when people say things
ipc.subscribe('_broadcast.incomingMessage.#', (data) => {
  setPingListener(ipc, moduleFullIdent, 'running');
  const message = JSON.parse(data);
  if (debug) clog.debug(message);
  if (debug) clog.debug(`Checking if user ${message.nick} has any tells`);
  const tells = findTellByUser.all({ toUser: message.nick });
  var replyText = '';
  if (tells.length) {
    if (debug) clog.debug(`Found tells for user ${message.nick}`, tells);
    for (let i = 0; i < tells.length; i++) {
      // eslint-disable-next-line security/detect-object-injection
      let tell = tells[i];
      if (tell.delivered === 0) {
        if (tell.platform === 'irc') {
          // eslint-disable-next-line prettier/prettier
          replyText += `${message.nick}: ${ircColor.blue(`${tell.fromUser}, ${readableTime(tell.dateSent)} ago:`)} ${tell.message}\n`;
        } else {
          // eslint-disable-next-line prettier/prettier
          replyText += `${message.nick}: ${`${tell.fromUser}, ${readableTime(tell.dateSent)} ago:`} ${tell.message}\n`;
        }
        markAsDelivered.run({
          date: new Date().toISOString(),
          id: tell.id,
        });
      }
      if (i === tells.length - 1) {
        const reply = {
          target: message.channel,
          text: replyText,
        };
        if (debug) clog.debug(`Sending reply to: ${message.replyTo}.outgoingMessage`, reply);
        ipc.publish(`${message.replyTo}.outgoingMessage`, JSON.stringify(reply));
      }
    }
  }
  setPingListener(ipc, moduleFullIdent, 'listening');
});
