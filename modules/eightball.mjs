'use strict';

/* Ask the magic 8-ball module for eevee */
/* Contributed by mozai@wetfish */

/* Config start */

const answers = [
  'It is decidedly so',
  'You may rely on it',
  'Outlook good',
  'Yes definitely',
  'Signs point to yes',
  'Most likely',
  'Without a doubt',
  'Yes',
  'As I see it yes',
  'It is certain',
  'Very doubtful',
  'Outlook not so good',
  'My sources say no',
  "Don't count on it",
  'My reply is no',
  'Better not tell you now',
  'Concentrate and ask again',
  'Reply hazy try again',
  'Cannot predict now',
  'Ask again later',
];
const debug = true;
const names = ['magic Eight-ball\u{2122}', '8ball', 'eightball', '\u{277d}'];

/* Init start */

const ident = 'eightball';
import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { ipc, lockPidFile, handleSIGINT, setPingListener } from '../lib/common.mjs';
lockPidFile(ident);
setPingListener(ipc, ident, 'init');
const help = [
  {
    command: '8ball',
    descr: 'Ask the 8ball a question',
    params: [
      {
        param: 'question',
        required: true,
        descr: 'Question to ask',
      },
    ],
  },
];

ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
  setPingListener(ipc, ident, 'running');
  ipc.publish(
    '_help.update',
    JSON.stringify({
      from: ident,
      help: help,
    }),
  );
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

/* Main start */

const oracle = (data) => {
  const request = JSON.parse(data);
  if (/[A-Za-z].+[A-Za-z]/.test(request.args)) {
    /* TODO: how the F to determine they asked a question? */
    const reply = {
      target: request.channel,
      text:
        'The ' +
        names[Math.floor(Math.random() * names.length)] +
        ' says: ' +
        ircColor.blue(answers[Math.floor(Math.random() * answers.length)]),
    };
    if (debug) clog.debug(`Sending answer to: ${request.replyTo}.outgoingMessage`, reply);
    ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
  }
};

ipc.subscribe('eightball.request', oracle);
ipc.subscribe('8ball.request', oracle);
