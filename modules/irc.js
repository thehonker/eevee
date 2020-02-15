'use strict';

process.env.PM2_HOME = `${__dirname}/proc`;

const clog = require('ee-log');
const nrp = require('node-redis-pubsub');
const pm2 = require('pm2');
const path = require('path');
const hjson = require('hjson');
const fs = require('fs');
const argv = require('yargs-parser')(process.argv.slice(2), {
  boolean: ['debug', 'verbose'],
});

var debug = true; // Set to true to override cli option --debug, set to false to respect --debug option
if (argv.debug) debug = true;

var verbose = true; // Set to true to override cli option --verbose, set to false to respect --verbose option
if (argv.verbose) verbose = true;
if (debug) verbose = true; // If debug is set to true then we'll turn on verbose as well

// Pubsub for the rest of the bot
const ipc = new nrp({ scope: 'eevee.main' });
// Pubsub for worker processes
const workerIpc = new nrp({ scope: 'eevee.irc' });

ipc.on('error', (error) => {
  clog.error('IPC Error', error);
});

workerIpc.on('error', (error) => {
  clog.error('Worker IPC Error', error);
});

ipc.on('irc:*', (data) => {
  if (debug) clog.debug('from main ipc', data);
});
workerIpc.on('*', (data) => {
  if (debug) clog.debug('from worker', data);
});

process.on('SIGINT', () => {
  if (debug) clog.debug('SIGINT received, closing');
  console.log('SIGINT received, closing');
  ipc.quit();
  workerIpc.quit();
  process.exitCode = 0;
});

// Load config
fs.readFile('../etc/irc.hjson', 'utf8', (err, data) => {
  if (err) throw new Error(err);
  const config = hjson.rt.parse(data);
  if (debug) clog.debug('irc startup config', config);
  Object.keys(config.servers).forEach((entry) => {
    // eslint-disable-next-line security/detect-object-injection
    if (debug) clog.debug('server config', config.servers[entry]);
  });
});

// If we're running as a module, tell pm2 we're ready
if (process.send) process.send('ready');
