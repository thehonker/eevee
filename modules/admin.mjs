'use strict';

// Admin module. Allows module start/stop/restart and bot join/part/nick change

const ident = 'admin';
const debug = true;

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT, getConfig } from '../lib/common.mjs';
import { start as moduleStart, stop as moduleStop, status as botStatus } from '../lib/eeveepm.mjs';
import { default as AsciiTable } from 'ascii-table';

lockPidFile(ident);

const config = getConfig(ident);
if (debug) clog.debug(config);

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc);
});

ipc.subscribe('admin.request', (data) => {
  const request = JSON.parse(data);
  if (debug) clog.debug('Admin request received:', request);
  request.argsArray = request.args.split(' ');

  // Check if request is coming from an admin
  if (request.ident === config.botOwner) {
    // If it's an eevee-pm request, handle it ourselves
    if (request.argsArray[0] === 'pm') {
      switch (request.argsArray[1]) {
        case 'start':
          eeveePMActions.start(request);
          break;
        case 'stop':
          eeveePMActions.stop(request);
          break;
        case 'restart':
          eeveePMActions.stop(request, () => {
            setTimeout(() => {
              eeveePMActions.start(request);
            }, 500);
          });
          break;
        case 'status':
          eeveePMActions.status(request);
          break;
        default:
          // Print some "u need to gimme an arg homie" type message
          break;
      }
    } else {
      // Anything else push into ipc for modules to pick up on
      const target = request.argsArray[0];
      if (debug) clog.debug(`Sending admin command to ${target}`, request);
      ipc.publish(`${target}.admin`, JSON.stringify(request));
    }
  } else {
    const reply = {
      target: request.channel,
      text: `${request.nick}: You're not an admin!`,
    };
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  }
});

const eeveePMActions = {
  start: (request, cb) => {
    const module = request.argsArray[2];
    moduleStart({ target: module }, (result) => {
      if (result.result === 'success') {
        const reply = {
          target: request.channel,
          text: `Command: "start ${module}" completed successfully (pid is ${result.childPID})`,
        };
        console.log(reply.text);
        if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        if (cb) cb(0);
        return 0;
      } else if (result.result === 'fail') {
        let string = null;
        if (result.err.code === 'E_ALREADY_RUNNING') {
          string = `Command "start ${module}" failed: ${result.err.code} (at ${result.err.path}).\n`;
          string += `Module already running? (pid ${result.childPID})`;
        } else {
          string = `Command "start ${module}" failed: Unknown error:\n`;
          string += JSON.stringify(result.err, null, 2);
        }
        const reply = {
          target: request.channel,
          text: string,
        };
        if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        console.log(reply.text);
        if (cb) cb(1);
        return 1;
      }
    });
  },

  stop: (request, cb) => {
    const module = request.argsArray[2];
    moduleStop({ target: module }, (result) => {
      if (result.result === 'success') {
        const reply = {
          target: request.channel,
          text: `Command: "stop  ${module}" completed successfully (pid was ${result.childPID})`,
        };
        console.log(reply.text);
        if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        if (cb) cb(0);
        return 0;
      } else if (result.result === 'fail') {
        var string = null;
        if (result.err.code === 'ENOENT') {
          string = `Command "stop ${module}" failed: ${result.err.code} at ${result.err.path} - Module not running?`;
        } else {
          string = `Command "stop ${module}" failed: Unknown error:\n`;
          string += JSON.stringify(result.err, null, 2);
        }
        const reply = {
          target: request.channel,
          text: string,
        };
        if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        console.log(reply.text);
        if (cb) cb(1);
        return 1;
      }
    });
  },

  status: (request, cb) => {
    const module = request.argsArray[2];
    botStatus({ target: module }, (result) => {
      var string = 'Running modules:\n';
      console.log('Running modules:');
      const outputTable = new AsciiTable();
      outputTable.setHeading('Module Name', 'pid');
      result.childPID.forEach((child) => {
        if (child.pid === process.pid) {
          outputTable.addRow(`${child.moduleName} (this instance)`, child.pid);
        } else {
          outputTable.addRow(child.moduleName, child.pid);
        }
      });
      string = string + outputTable.toString();
      console.log(outputTable.toString());
      const reply = {
        target: request.channel,
        text: string,
      };
      if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
      ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
      if (cb) cb(0);
      return 0;
    });
  },
};
