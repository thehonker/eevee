'use strict';

// Admin module. Allows module start/stop/restart and bot join/part/nick change

const ident = 'admin';
const debug = true;

import { default as clog } from 'ee-log';

import { ipc, lockPidFile, handleSIGINT, getConfig, setPingListener } from '../lib/common.mjs';
import { moduleStart, moduleStop, botStatus, moduleStatus } from '../lib/eeveepm.mjs';
import { default as AsciiTable } from 'ascii-table';

lockPidFile(ident);
setPingListener(ipc, ident, 'init');

const config = getConfig(ident);
if (debug) clog.debug(config);

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
  setPingListener(ipc, ident, 'running');
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
          eeveePMActions.restart(request);
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
  start: (request) => {
    clog.debug(request);
    const module = request.argsArray[2];
    moduleStart(ipc, module)
      .then((result) => {
        if (debug) clog.debug(result);
        const reply = {
          target: request.channel,
          text: `Command: "start ${module}" completed successfully (pid is ${result.pid})`,
        };
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        return;
      })
      .catch((err) => {
        clog.error(err);
        var reply = null;
        switch (err.code) {
          case 'E_RUNNING_VALID':
            reply = {
              target: request.channel,
              text: `Command: "start ${module}" failed: Module already running (valid pid file)`,
            };
            ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
            return;
          case 'E_RUNNING_STALE':
            reply = {
              target: request.channel,
              text: `Command: "start ${module}" failed: Module already running (stale pid file)`,
            };
            ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
            return;
          case 'E_UNRESPONSIVE_STALE':
            reply = {
              target: request.channel,
              text: `Command: "start ${module}" failed: Module might be running but but did not respond to to ping (manual intervention may be required)`,
            };
            ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
            return;
          default:
            return;
        }
      });
  },

  restart: (request) => {
    const module = request.argsArray[2];
    moduleStop(ipc, module)
      .then((result) => {
        if (debug) clog.debug(result);
        const reply = {
          target: request.channel,
          text: `Command: "stop ${module}" completed successfully (pid was ${result.pid})`,
        };
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        // eslint-disable-next-line promise/no-nesting
        moduleStart(ipc, module)
          .then((result) => {
            if (debug) clog.debug(result);
            const reply = {
              target: request.channel,
              text: `Command: "start ${module}" completed successfully (pid is ${result.pid})`,
            };
            ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
            return;
          })
          .catch((err) => {
            clog.error(err);
            var reply = null;
            switch (err.code) {
              case 'E_RUNNING_VALID':
                reply = {
                  target: request.channel,
                  text: `Command: "start ${module}" failed: Module already running (valid pid file)`,
                };
                ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
                return;
              case 'E_RUNNING_STALE':
                reply = {
                  target: request.channel,
                  text: `Command: "start ${module}" failed: Module already running (stale pid file)`,
                };
                ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
                return;
              case 'E_UNRESPONSIVE_STALE':
                reply = {
                  target: request.channel,
                  text: `Command: "start ${module}" failed: Module might be running but but did not respond to to ping (manual intervention may be required)`,
                };
                ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
                return;
              default:
                return;
            }
          });
        return;
      })
      .catch((err) => {
        clog.error(err.code, err.message);
        const reply = {
          target: request.channel,
          text: `Error: ${err.code}, ${err.message}`,
        };
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        return;
      });
  },

  stop: (request) => {
    const module = request.argsArray[2];
    moduleStop(ipc, module)
      .then((result) => {
        if (debug) clog.debug(result);
        const reply = {
          target: request.channel,
          text: `Command: "stop ${module}" completed successfully (pid was ${result.pid})`,
        };
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        return;
      })
      .catch((err) => {
        clog.error(err.code, err.message);
        const reply = {
          target: request.channel,
          text: `Error: ${err.code}, ${err.message}`,
        };
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        return;
      });
  },

  status: (request) => {
    if (debug) clog.debug(request);
    if (request.argsArray[2]) {
      const module = request.argsArray[2];
      moduleStatus(ipc, module)
        .then((moduleStatus) => {
          console.log(`Command: "status ${module}" completed successfully. Module information:`);
          const outputTable = new AsciiTable();
          outputTable.setHeading('module name', 'status', 'pid', 'pid file');
          outputTable.addRow(moduleStatus.ident, moduleStatus.status, moduleStatus.pid, moduleStatus.pidFileStatus);
          const reply = {
            target: request.channel,
            text: outputTable.toString(),
          };
          if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
          ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
          return;
        })
        .catch((err) => {
          clog.error(err);
          return 1;
        });
    } else {
      botStatus(ipc)
        .then((modules) => {
          if (debug) clog.debug(modules);
          console.log('Command: "status" completed successfully. Running modules:');
          const outputTable = new AsciiTable();
          outputTable.setHeading('module name', 'status', 'pid', 'pid file');
          modules.forEach((module) => {
            if (module.pid === process.pid) {
              outputTable.addRow(`${module.ident} (this instance)`, module.status, module.pid, module.pidFileStatus);
            } else {
              outputTable.addRow(module.ident, module.status, module.pid, module.pidFileStatus);
            }
          });
          const reply = {
            target: request.channel,
            text: outputTable.toString(),
          };
          if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
          ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
          return;
        })
        .catch((err) => {
          clog.error(err.code, err.message);
          const reply = {
            target: request.channel,
            text: `Error: ${err.code}, ${err.message}`,
          };
          ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
          return;
        });
    }
  },
};
