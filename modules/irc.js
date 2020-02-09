'use strict';

process.env.PM2_HOME = path.join(__dirname, '../.pm2');

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
argv.debug ? (debug = true) : null;

var verbose = true; // Set to true to override cli option --verbose, set to false to respect --verbose option
argv.verbose ? (verbose = true) : null;
debug ? (verbose = true) : null; // If debug is set to true then we'll turn on verbose as well

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
  debug ? clog.debug('from main ipc', data) : null;
});
workerIpc.on('*', (data) => {
  debug ? clog.debug('from worker', data) : null;
});

process.on('SIGINT', () => {
  debug ? clog.debug('SIGINT received, closing') : null;
  console.log('SIGINT received, closing');
  ipc.quit();
  workerIpc.quit();
  process.exitCode = 0;
});

// Load config
fs.readFile('../etc/irc.hjson', 'utf8', (err, data) => {
  if (err) throw new Error(err);
  const config = hjson.rt.parse(data);
  debug ? clog.debug('irc startup config', config) : null;
  Object.keys(config.servers).forEach((entry) => {
    // eslint-disable-next-line security/detect-object-injection
    debug ? clog.debug('server config', config.servers[entry]) : null;
  });
});

// If we're running as a module, tell pm2 we're ready
process.send ? process.send('ready') : null;
