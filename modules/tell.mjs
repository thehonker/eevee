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

const addTell = db.prepare(
  `INSERT INTO ${tableName} (id, dateSent, fromConnector, fromChannel, fromIdent, fromUser, toUser, message, pm, delivered)
   VALUES (@id, @dateSent, @fromConnector, @fromChannel, @fromIdent, @fromUser, @toUser, @message, @pm, @delivered)`,
);

const findTellByUser = db.prepare(`SELECT * FROM '${tableName}' WHERE toUser = @toUser`);
const markAsDelivered = db.prepare(`UPDATE '${tableName}' SET delivered = @date WHERE id = @id`);
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
    pm: 'false',
    delivered: null,
  };

  addTell.run(newTellData);

  var replyText = `Message to ${toUser} saved! (ID: ${data.id})`;
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
ipc.subscribe('incomingMessageBroadcast.#', (data) => {
  data = JSON.parse(data);
  if (debug) clog.debug(`Checking if user ${data.nick} has any tells`);
  const tells = findTellByUser.all({ toUser: data.nick });
  if (tells.length) {
    if (debug) clog.debug(`Found tells for user ${data.nick}`, tells);
    tells.forEach((tell) => {
      if (tell.delivered === null) {
        var replyText = `${data.nick}: ${ircColor.green(tell.fromUser)} at ${ircColor.blue(tell.dateSent)}: ${tell.message}`;
        if (tell.platform === 'irc') {
          replyText = `${data.nick}: tell from ${tell.fromUser} at ${tell.dateSent}: ${tell.message}`;
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
