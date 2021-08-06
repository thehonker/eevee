'use strict';

// URLTitle module. Grabs the <title> tag from links it hears. Has special handlers for youtube and etc.

const ident = 'urltitle';
const debug = true;

import { default as clog } from 'ee-log';
import { default as YouTube } from 'youtube-node';
import { default as youtubeID } from 'get-youtube-id';
import { default as ircColor } from 'irc-colors';
import { default as needle } from 'needle';

import { ipc, lockPidFile, handleSIGINT, setPingListener, getConfig } from '../lib/common.mjs';

lockPidFile(ident);

setPingListener(ipc, ident, 'init');

const help = [];

var config = getConfig(ident);

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

const youtube = new YouTube();
youtube.setKey(config.youtube.api_key);

ipc.subscribe('_broadcast.incomingMessage.#', (data) => {
  const request = JSON.parse(data);
  const httpsRegex = new RegExp('https?\\S+', 'g');
  if (httpsRegex.test(request.text)) {
    if (debug) clog.debug('URL received:', request);
    const url = request.text.match(httpsRegex);
    if (debug) clog.debug('URL', url);
    fetchTitle(url)
      .then((titleString) => {
        const reply = {
          target: request.channel,
          text: titleString,
        };
        if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        return;
      })
      .catch((error) => {
        clog.error(error);
        return;
      });
  }
});

function fetchTitle(url) {
  return new Promise((resolve, reject) => {
    url = url.toString();
    const ytid = youtubeID(url);
    if (ytid) {
      youtube.getById([ytid], (error, response) => {
        if (error) return reject(error);
        const title = response.items[0].snippet.title;
        const date = response.items[0].snippet.publishedAt;
        const views = response.items[0].statistics.viewCount;
        const likes = response.items[0].statistics.likeCount;
        const dislikes = response.items[0].statistics.dislikeCount;
        const comments = response.items[0].statistics.commentCount;
        const duration = response.items[0].contentDetails.duration
          .replace('PT', '')
          .replace('H', 'h ')
          .replace('M', 'm ')
          .replace('S', 's');
        const ytLogo = ircColor.black.bgwhite('You') + ircColor.white.bgred('Tube');
        // eslint-disable-next-line prettier/prettier
        const titleString = `${ytLogo} [${ircColor.blue(title)}] [${duration}] [${ircColor.yellow(views)}] [${ircColor.green(likes)}|${ircColor.red(dislikes)}] [${ircColor.purple(comments)}]`;
        return resolve(titleString);
      });
    } else {
      needle.get(
        url,
        {
          follow_max: 3,
        },
        (error, response) => {
          if (error) return reject(error);
          const titleRegex = new RegExp('<title.*>(.*)<.*\\/title>');
          const title = response.body.match(titleRegex);
          if (title) {
            return resolve(`[ ${ircColor.blue(title[1])} ]`);
          }
        },
      );
    }
  });
}
