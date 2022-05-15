'use strict';

// Echo module. Parrots back what it receives

const ident = 'emote';
const debug = true;

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';

import { ipc, lockPidFile, handleSIGINT, setPingListener } from '../lib/common.mjs';

lockPidFile(ident);

setPingListener(ipc, ident, 'init');

const help = [
  {
    command: 'dunno',
    descr: 'dunno face',
    params: [],
  },
  {
    command: 'shrug',
    descr: 'shrug face',
    params: [],
  },
  {
    command: 'dudeweed',
    descr: 'dude weed lmao',
    params: [],
  },
  {
    command: 'downy',
    descr: 'downy face',
    params: [],
  },
  {
    command: 'doubledowny',
    descr: 'two downys in a row',
    params: [],
  },
  {
    command: 'tripppledowny',
    descr: 'three downys in a row',
    params: [],
  },
  {
    command: 'rainbowdowny',
    descr: 'rainbow-ized downy face',
    params: [],
  },
  {
    command: 'id',
    descr: 'illegal drugs',
    params: [],
  },
  {
    command: 'ld',
    descr: 'legal drugs',
    params: [],
  },
  {
    command: 'lv',
    descr: 'heart',
    params: [],
  },
  {
    command: 'intense',
    descr: 'intensify your text',
    params: [
      {
        param: 'text',
        required: true,
        descr: 'Text to intensify',
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

ipc.subscribe('dunno.request', (data) => {
  const request = JSON.parse(data);
  // eslint-disable-next-line prettier/prettier
  const faces = [
    '‾\\(ツ)/‾',
    '¯\\(º_o)/¯',
    '¯\\_(シ)_/¯',
    '〳 ◔ Ĺ̯ ◔ \\',
    '乁໒( ͒ ⌂ ͒ )७ㄏ',
    'ʕ ᵒ̌ ‸ ᵒ̌ ʔ',
    '(⊹◕ʖ̯◕)',
    '໒( ” ͠° ʖ̫ °͠ ” )७',
    'ʕ ͠° ʖ̫ °͠ ʔ',
  ];
  const reply = {
    target: request.channel,
    text: ircColor.lime(faces[Math.floor(Math.random() * faces.length)]),
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});

ipc.subscribe('shrug.request', (data) => {
  const request = JSON.parse(data);
  const face = '¯\\_(ツ)_/¯';
  const reply = {
    target: request.channel,
    text: face,
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});

ipc.subscribe('dudeweed.request', (data) => {
  const request = JSON.parse(data);
  const string = ircColor.green.inverse('dude weed lmao');
  const reply = {
    target: request.channel,
    text: string,
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});

ipc.subscribe('downy.request', (data) => {
  const request = JSON.parse(data);
  const string = ircColor.red(".'\x1f/\x1f)");
  const reply = {
    target: request.channel,
    text: string,
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});

ipc.subscribe('doubledowny.request', (data) => {
  const request = JSON.parse(data);
  const string = ircColor.blue(".'\x1f/\x1f)");
  const reply = {
    target: request.channel,
    text: string,
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});

ipc.subscribe('tripppledowny.request', (data) => {
  const request = JSON.parse(data);
  const string = ircColor.green(".'\x1f/\x1f)");
  const reply = {
    target: request.channel,
    text: string,
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});

ipc.subscribe('rainbowdowny.request', (data) => {
  const request = JSON.parse(data);
  const string = ircColor.rainbow(".'\x1f/\x1f)");
  const reply = {
    target: request.channel,
    text: string,
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});

ipc.subscribe('id.request', (data) => {
  const request = JSON.parse(data);
  var string = '';

  const x = ~~(Math.random() * 4) + 0;
  const y = ~~(Math.random() * 999) + 0;

  if (y >= 800) {
    const dbladez = [
      'illegal dbladez',
      'I snuck dbladez into prison up my ass.',
      'I love sniffing whole lines of dbladez.',
      'Twenty-five years in prison was worth it for just one hit of dbladez',
      'Taking dbladez ruined my life.',
    ];
    // eslint-disable-next-line security/detect-object-injection
    string = ircColor.bold(dbladez[x]);
  } else {
    string = ircColor.bold('illegal drugs');
  }
  const reply = {
    target: request.channel,
    text: string,
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});

ipc.subscribe('ld.request', (data) => {
  const request = JSON.parse(data);
  var string = '';
  const x = ~~(Math.random() * 29) + 0;

  if (x == 9) {
    string = ircColor.bold('There are no legal drugs.');
  } else if (x == 19) {
    string = ircColor.bold('All drugs are illegal.');
  } else if (x == 29) {
    string = ircColor.bold('Your drug use has been logged and reported.');
  } else {
    string = ircColor.bold('legal drugs\x02');
  }

  const reply = {
    target: request.channel,
    text: string,
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});

ipc.subscribe('intense.request', (data) => {
  const request = JSON.parse(data);
  var string = ircColor.bold('[' + request.args + ' intensifies]');
  const reply = {
    target: request.channel,
    text: string,
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});

ipc.subscribe('lv.request', (data) => {
  const request = JSON.parse(data);
  var string = ircColor.red('♥');
  const reply = {
    target: request.channel,
    text: string,
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});
