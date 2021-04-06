'use strict';

// Weather module. Takes in a zip code and displays the weather

const ident = 'weather';

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { default as sqlite3 } from 'better-sqlite3';
import { default as needle } from 'needle';
import { default as imgur } from 'imgur';
import { default as proj4 } from 'proj4';
import { default as mathjs } from 'mathjs';

import { ipc, lockPidFile, handleSIGINT, getConfig, getDirName, setPingListener } from '../lib/common.mjs';

// Globals
const debug = true;
var db = null;

// Yay es6
const __dirname = getDirName();

// Module ident / instance logic
var moduleIdent = 'weather';
var moduleInstance = null;
var moduleFullIdent = moduleIdent;
if (process.argv[2] === '--instance' && process.argv[3]) {
  moduleInstance = process.argv[3];
  moduleFullIdent = moduleIdent + '.' + moduleInstance;
  if (debug) clog.debug(`My moduleFullIdent is: ${moduleFullIdent}`);
}

lockPidFile(moduleFullIdent);

setPingListener(ipc, moduleFullIdent, 'init');

// Pull in our config
const config = getConfig(moduleFullIdent);
if (debug) clog.debug('Config', config);

// Things that need to be done once the ipc is "connected"
ipc.on('start', () => {
  if (debug) clog.debug('IPC "connected"');
  if (process.send) process.send('ready');
  setPingListener(ipc, ident, 'running');
});

process.on('SIGINT', () => {
  // Close DB connection
  db.close();
  // Run common handler
  handleSIGINT(moduleFullIdent, ipc);
});

// Check / Create DB
var tableName = 'weather';
if (moduleInstance) tableName = `weather-${moduleInstance}`;

try {
  const createTableString = `
    CREATE TABLE IF NOT EXISTS '${tableName}' (
      'nick' varchar(255) PRIMARY KEY,
      'dateSet' varchar(255),
      'locationSearch' varchar(255),
      'zipCode' varchar(255),
      'units' character(20),
      'lat' real,
      'lon' real,
      'mapLayer' varchar(255),
      'mapZoom' integer,
      'mapTileStartX' integer,
      'mapTileStartY' integer,
      'mapTileStopX' integer,
      'mapTileStopY' integer
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
  clog.error('Error in Create/Check weather table', err);
  setPingListener(ipc, moduleFullIdent, 'error');
  // Close DB connection
  db.close();
  // Run common handler
  handleSIGINT(moduleFullIdent, ipc);
}

const dbFindWeatherUser = db.prepare(`SELECT * FROM '${tableName}' WHERE nick = @nick ORDER BY dateSet DESC;`);

const dbSetUpdateWeatherLocation = db.prepare(
  `INSERT INTO ${tableName} (
    nick,
    dateSet,
    locationSearch,
    lat,
    lon
  )
  VALUES (
    @nick,
    @dateSet,
    @locationSearch,
    @lat,
    @lon
  )
  ON CONFLICT (nick) DO UPDATE SET 
    dateSet = @dateSet, 
    locationSearch = @locationSearch,
    lat = @lat,
    lon = @lon
`,
);

// IPC Listeners
ipc.subscribe('weather.request', weather);

ipc.subscribe('weathermap.request', (data) => {
  const request = JSON.parse(data);
  if (debug) clog.debug('weathermap request received:', request);
  const args = request.args.split(' ');
  const result = latLonToTileCoords(args[0], args[1], args[2]);
  const reply = {
    target: request.channel,
    text: JSON.stringify(result),
  };
  if (debug) clog.debug(`Sending reply to: ${request.replyTo}.outgoingMessage`, reply);
  ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
});

// Primary functions
function weather(data) {
  const request = JSON.parse(data);
  if (debug) clog.debug('weather request received', request);
  // If they specified a location to search, look up the lat/lon
  if (request.args.split(' ')[0] != '') {
    createUpdateWeatherLocation(request.args.split(' ')[0], request.nick)
      .then((dbInsertResult) => {
        if (debug) clog.debug(dbInsertResult);
        const userData = dbFindWeatherUser.get({ nick: request.nick });
        if (userData) {
          if (debug) clog.debug('Weather User found:', userData);
          // eslint-disable-next-line promise/no-nesting
          getCurrentWeatherLatLon(userData.lat, userData.lon)
            .then((weather) => {
              if (debug) clog.debug(weather);
              var string = `${weather.weather[0].description} - ${weather.main.temp}degK - ${weather.main.humidity}% humidity`;
              const reply = {
                target: request.channel,
                text: string,
              };
              if (debug) clog.debug(reply);
              ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
              return;
            })
            .catch((err) => {
              clog.error(err);
              return;
            });
          return;
        }
        const reply = {
          target: request.channel,
          text: 'You need to set a weather location',
        };
        if (debug) clog.debug(reply);
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        return;
      })
      .catch((err) => {
        clog.error(err);
        return;
      });
  } else {
    const userData = dbFindWeatherUser.get({ nick: request.nick });
    if (userData) {
      if (debug) clog.debug('Weather User found:', userData);
      // eslint-disable-next-line promise/no-nesting
      getCurrentWeatherLatLon(userData.lat, userData.lon)
        .then((weather) => {
          if (debug) clog.debug(weather);
          var string = `${weather.weather[0].description} - ${weather.main.temp}degK - ${weather.main.humidity}% humidity`;
          const reply = {
            target: request.channel,
            text: string,
          };
          if (debug) clog.debug(reply);
          ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
          return;
        })
        .catch((err) => {
          clog.error(err);
          return;
        });
      return;
    } else {
      const reply = {
        target: request.channel,
        text: 'You need to set a weather location',
      };
      if (debug) clog.debug(reply);
      ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
      return;
    }
  }
}

// Helper functions
function createUpdateWeatherLocation(locationSearch, nick) {
  return new Promise((resolve, reject) => {
    const locationApiUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${locationSearch}&limit=1&appid=${config.apiKey}`;
    if (debug) clog.debug(locationApiUrl);
    needle.get(locationApiUrl, (err, response) => {
      if (err) {
        clog.error(err);
        return reject(err);
      }
      if (response.body) {
        if (debug) clog.debug('locationApi response', response.body);
        const insert = {
          nick: nick,
          dateSet: new Date().toISOString(),
          locationSearch: locationSearch,
          lat: response.body[0].lat,
          lon: response.body[0].lon,
        };
        const dbInsertResult = dbSetUpdateWeatherLocation.run(insert);
        if (debug) clog.debug(dbInsertResult);
        return resolve(dbInsertResult);
      } else {
        let err = new Error('Error fetching location data');
        err.code = 'E_API_CALL_FAILED';
        clog.error(err);
        return reject(err);
      }
    });
  });
}

function getCurrentWeatherLatLon(lat, lon) {
  return new Promise((resolve, reject) => {
    const weatherApiUrl = `http://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=standard&appid=${config.apiKey}`;
    if (debug) clog.debug(weatherApiUrl);
    needle.get(weatherApiUrl, (err, response) => {
      if (err) {
        clog.error(err);
        return reject(err);
      }
      if (response.body) {
        return resolve(response.body);
      } else {
        let err = new Error('Error fetching current weather data');
        err.code = 'E_API_CALL_FAILED';
        clog.error(err);
        return reject(err);
      }
    });
  });
}

function latLonToTileCoords(lon, lat, zoom) {
  const lat_rad = deg2rad(lat);
  const n = 2 ** zoom;
  const x = n * ((lon + 180) / 360);
  const y = n * ((1 - mathjs.asin(mathjs.tan(lat_rad)) / mathjs.pi) * 2 ** (zoom - 1));
  clog.debug(lon, lat, lat_rad, zoom, n, x, y);
  return {
    x: x,
    y: y,
  };
}

function deg2rad(degrees) {
  var pi = mathjs.pi;
  const rad = degrees * (pi / 180);
  clog.debug(degrees, rad);
  return rad;
}
