'use strict';

// Irc. Talks to irc servers and passes messages over to irc-router

const debug = true;

import { default as clog } from 'ee-log';
import { default as IRC } from 'irc-framework';

import { ipc, lockPidFile, handleSIGINT, getConfig, setPingListener } from '../../lib/common.mjs';

var moduleIdent = 'irc-connector';
var moduleInstance = null;
var moduleFullIdent = moduleIdent;

var autoReconnect = false;

if (debug) clog.debug('process.argv:', process.argv);

if (process.argv[2] === '--instance' && process.argv[3]) {
  moduleInstance = process.argv[3];
  moduleFullIdent = moduleIdent + '.' + moduleInstance;
} else {
  if (debug) clog.debug('No instance name provided!');
  let err = new Error('No instance name provided');
  err.code = 'E_INSTANCE_REQUIRED';
  if (process.send) process.send('fail');
  throw err;
}

lockPidFile(moduleFullIdent);

setPingListener(ipc, moduleFullIdent);

const config = getConfig(moduleFullIdent);
// Add channel list to post-connect actions
config.channels.forEach((channel) => {
  config.postConnectActions.push({
    action: 'join',
    channel: channel.name,
    key: channel.key,
  });
});

if (debug) clog.debug('Configuration: ', config);

const client = new IRC.Client(config.client);

// Print every message we receive if debug is enabled
if (debug) {
  clog.debug(`[Debug]: Subscribing to ${moduleFullIdent}.#`);
  ipc.subscribe(`${moduleFullIdent}.#`, (data, info) => {
    clog.debug('incoming IPC message: ', info, data.toString());
  });
}

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');

  if (debug) clog.debug('Attempting to connect to IRC server');
  client.connect(config.client);
});

client.on('registered', () => {
  if (debug) clog.debug('Client connected.');
  // Execute login script
  setTimeout(() => {
    var postConnectPromise = Promise.resolve();
    config.postConnectActions.forEach((action) => {
      postConnectPromise = postConnectPromise.then(() => {
        if (debug) clog.debug('Running post-connect action', action);
        if (action.action === 'pm') {
          client.say(action.target, action.message);
        }
        if (action.action === 'usermode') {
          client.raw(`MODE ${action.target} :${action.mode}`);
        }
        if (action.action === 'join') {
          if (debug) clog.debug('Joining channel', action);
          client.join(action.channel, action.key);
          // We can join channels async, so we return immediately
          // At least... that's how I think this works
          return;
        }
        return new Promise((resolve) => {
          setTimeout(resolve, 1000);
        });
      });
    });
  }, 2000);
});

// This makes a /lot/ of noise
/* So we'll turn it off for now
client.on('raw', (message) => {
  if (debug) clog.debug('raw message:', message);
});
*/

// When the server sends us a normal message event
client.on('message', (data) => {
  // This makes a /lot/ of noise
  if (debug) clog.debug('Client message:', data);
  ipc.publish(`irc-parser.${moduleInstance}.incomingMessage`, JSON.stringify(data));
});

// There's other, more compact ways of doing this
// But I like how verbose this is

// Listen for outgoing messages
clog.debug(`Subscribing to: irc-connector.${moduleInstance}.outgoingMessage`);
ipc.subscribe(`irc-connector.${moduleInstance}.outgoingMessage`, (data) => {
  const msg = JSON.parse(data);
  if (debug) clog.debug('Received outgoingMessage:', msg);
  client.say(msg.target, msg.text);
});

// Listen for outgoing actions
clog.debug(`Subscribing to: irc-connector.${moduleInstance}.outgoingAction`);
ipc.subscribe(`irc-connector.${moduleInstance}.outgoingAction`, (data) => {
  const msg = JSON.parse(data);
  if (debug) clog.debug('Received outgoingAction:', msg);
  client.action(msg.target, msg.text);
});

// Listen for whois requests
clog.debug(`Subscribing to: irc-connector.${moduleInstance}.whoisRequest`);
ipc.subscribe(`irc-connector.${moduleInstance}.whoisRequest`, (data) => {
  const msg = JSON.parse(data);
  if (debug) clog.debug('Received whoisRequest:', msg);
  client.whois(msg.target);
});

// Listen for setTopic actions
clog.debug(`Subscribing to: irc-connector.${moduleInstance}.setTopic`);
ipc.subscribe(`irc-connector.${moduleInstance}.setTopic`, (data) => {
  const msg = JSON.parse(data);
  if (debug) clog.debug('Received setTopic:', msg);
  client.setTopic(msg.target, msg.text);
});

// Admin commands
clog.debug(`Subscribing to: irc-connector.${moduleInstance}.admin`);
ipc.subscribe(`irc-connector.${moduleInstance}.admin`, (data) => {
  const request = JSON.parse(data);
  if (debug) clog.debug('Received admin command:', request);
  const command = request.argsArray[1];
  switch (command) {
    case 'join':
      client.join(request.argsArray[2], request.argsArray[3]);
      break;
    case 'part':
      client.part(request.argsArray[2], 'Part command received');
      break;
    case 'quit':
      client.quit('Quit command received');
      break;
    case 'reconnect':
      reconnect();
      break;
    default:
      break;
  }
});

const reconnect = () => {
  autoReconnect = false;
  client.quit('Reconnect command received');
  client.connect(config.client);
  autoReconnect = true;
};

// Every 5 seconds check to see if we're still connected and reconnect if necessary
const reconnectCheck = setInterval(() => {
  if (!client.connected && autoReconnect) {
    clog.error('Client disconnected, reconnecting');
    client.connect(config.client);
  }
}, 5000);

// Handle SIGINT
process.on('SIGINT', () => {
  client.quit('SIGINT received');
  client.removeAllListeners();
  clearInterval(reconnectCheck);
  handleSIGINT(moduleFullIdent, ipc, debug);
});
