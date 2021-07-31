'use strict';

// Help module
// Gathers help docs from other modules and pretty prints them

const ident = 'help';
const debug = true;

import { default as clog } from 'ee-log';
import { default as Table } from 'cli-table';

import { ipc, lockPidFile, handleSIGINT, setPingListener } from '../lib/common.mjs';

const helpCache = new Map();

lockPidFile(ident);

setPingListener(ipc, ident, 'init');

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
  ipc.publish('_help.updateRequest', '');
  setPingListener(ipc, ident, 'listening');
});

process.on('SIGINT', () => {
  handleSIGINT(ident, ipc);
});

ipc.subscribe('_help.update', (_data) => {
  const data = JSON.parse(_data);
  if (debug) clog.debug('Help update received', data);
  helpCache.set(data.from, data.help);
});

ipc.subscribe('help.request', (data) => {
  setPingListener(ipc, ident, 'running');
  const request = JSON.parse(data);
  if (debug) clog.debug('help request received:', request);

  const sortedHelp = new Map([...helpCache.entries()].sort());
  if (debug) clog.debug(sortedHelp);

  helpCache.forEach((commands, module) => {
    const helpTable = new Table({
      head: ['Command', 'Args', 'Description'],
      colWidths: [20, 30, 40],
      style: { compact: true, 'padding-left': 1 },
    });

    if (debug) clog.debug(commands, module);
    commands.forEach((command) => {
      var argsString = '';
      command.params.forEach((param) => {
        if (param.required) {
          argsString += `<${param.param}> `;
        } else {
          argsString += `[${param.param}] `;
        }
      });
      helpTable.push([`${request.prefix}${command.command}`, argsString, stringDivider(command.descr, 38, '\n')]);
    });
    const reply = {
      target: request.nick,
      text: 'Module: ' + module + '\n' + helpTable.toString(),
    };
    if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  });

  setPingListener(ipc, ident, 'listening');
});

/*

[6:48 PM] eggs: when a module starts up he emits "hey here's my help stuff"
[6:49 PM] eggs: help guy pings and unregisters help for any module that goes awol
[6:49 PM] eggs: if help module restart or whatever he can emit a "pls send me help"
[6:49 PM] eggs: in which case they all emit "hey heres my help stuff" agian
[6:51 PM] eggs: then the "hey here's my help stuff" message consists of 1) a template, and 2) a substitutions dictionary
[6:51 PM] eggs: help module merges a set of "global" substitutions into that
[6:51 PM] eggs: then runs the formatter
[6:52 PM] eggs: global substitutions would just consist of shit that all modules could conceivably want to sub in like "this is the bot's name, this is my owner, this is my cmd prefix"

*/

function stringDivider(str, width, spaceReplacer) {
  if (str.length > width) {
    var p = width;
    // eslint-disable-next-line security/detect-object-injection
    for (; p > 0 && str[p] != ' '; p--) {}
    if (p > 0) {
      var left = str.substring(0, p);
      var right = str.substring(p + 1);
      return left + spaceReplacer + stringDivider(right, width, spaceReplacer);
    }
  }
  return str;
}
