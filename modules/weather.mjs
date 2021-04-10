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
ipc.subscribe('weather.request', (data) => {
  const request = JSON.parse(data);
  if (debug) clog.debug('weather request received', request);

  if (request.args.split(' ')[0] != '') {
    createUpdateWeatherLocation(request.args.split(' ')[0], request.nick)
      .then((dbInsertResult) => {
        if (debug) clog.debug(dbInsertResult);
        weather(request);
        return;
      })
      .catch((err) => {
        clog.error(err);
      });
  } else {
    weather(request);
    return;
  }
});

ipc.subscribe('weathermap.request', weatherMap);

// Primary functions
function weather(request) {
  const userData = dbFindWeatherUser.get({ nick: request.nick });
  if (userData) {
    if (debug) clog.debug('Weather User found:', userData);
    // eslint-disable-next-line promise/no-nesting
    getCurrentWeatherLatLon(userData.lat, userData.lon)
      .then((weather) => {
        if (debug) clog.debug(weather);
        var string = '';
        const tempString = formatTempString(weather.main.temp, userData.units, request.platform);
        const descriptionString = formatDescriptionString(
          weather.weather[0].description,
          weather.weather[0].id,
          request.platform,
        );
        string = `${descriptionString} - ${tempString} - ${weather.main.humidity}% humidity`;
        if (debug) console.log(string);
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

function weatherMap(data) {
  const request = JSON.parse(data);
  if (debug) clog.debug('WeatherMap request received:', request);
  // If they specified a location to search, look up the lat/lon
  if (request.args.split(' ')[0] != '') {
    createUpdateWeatherLocation(request.args.split(' ')[0], request.nick)
      .then((dbInsertResult) => {
        if (debug) clog.debug(dbInsertResult);
        const userData = dbFindWeatherUser.get({ nick: request.nick });
        if (userData) {
          if (debug) clog.debug('Weather User found:', userData);
          // eslint-disable-next-line promise/no-nesting
          getWeatherMapLatLon(userData.lat, userData.lon, 4)
            .then((url) => {
              const reply = {
                target: request.channel,
                text: url,
              };
              if (debug) clog.debug(reply);
              ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
              return;
            })
            .catch((err) => {
              const reply = {
                target: request.channel,
                text: `Error fetching weather map: ${err.code}`,
              };
              if (debug) clog.debug(reply);
              ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
              return;
            });
        } else {
          const reply = {
            target: request.channel,
            text: 'You need to set a weather location',
          };
          if (debug) clog.debug(reply);
          ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
          return;
        }
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
        if (response.body.cod == '404') {
          let err = new Error('Location not found');
          err.code = 'E_API_404';
          clog.error(err);
          return reject(err);
        } else {
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
        }
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

function getWeatherMapLatLon(lat, lon, zoom) {
  return new Promise((resolve, reject) => {
    const tileCoords = latLonToTileCoords(lat, lon, zoom);
    var x = mathjs.round(tileCoords.x);
    var y = mathjs.round(tileCoords.y);
    if (debug) clog.debug('tile coords', x, y);
    const coordinateMatrix = [
      // eslint-disable-next-line prettier/prettier
      [x--, y++], [x, y++], [x++, y++],
      // eslint-disable-next-line prettier/prettier
      [x--, y],   [x, y],   [x++, y],
      // eslint-disable-next-line prettier/prettier
      [x--, y--], [x, y--], [x++, y--],
    ];
    var imageMatrix = [];
    for (let i = 0; i < 9; i++) {
      // eslint-disable-next-line security/detect-object-injection
      if (debug) clog.debug(`requesting image at [${coordinateMatrix[i][0]}, ${coordinateMatrix[i][1]}]`);
      // eslint-disable-next-line security/detect-object-injection
      const openWeatherMapTileApiUrl = `https://tile.openweathermap.org/map/temp_new/${zoom}/${coordinateMatrix[i][0]}/${coordinateMatrix[i][1]}.png?appid=${config.apiKey}`;
      if (debug) clog.debug(openWeatherMapTileApiUrl);
      needle.get(openWeatherMapTileApiUrl, (err, response) => {
        if (err) {
          clog.error(err);
          return reject(err);
        }
        if (debug) clog.debug(response.body);
        // eslint-disable-next-line security/detect-object-injection
        imageMatrix[i] = response.body;
      });
    }
    clog.debug(imageMatrix);
    return resolve('images requested');
  });
}

function latLonToTileCoords(lat, lon, zoom) {
  var x = deg2rad(lon);
  var y = deg2rad(lat);

  y = mathjs.asinh(mathjs.tan(y));

  // eslint-disable-next-line prettier/prettier
  x = (1 + (x / mathjs.pi)) / 2;
  // eslint-disable-next-line prettier/prettier
  y = (1 - (y / mathjs.pi)) / 2;

  var n = 2 ** zoom;

  x = x * n;
  y = y * n;

  clog.debug(lon, lat, x, y, n);
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

function kelvin2celsius(degrees) {
  degrees = Number.parseInt(degrees);
  const degC = degrees - 273.15;
  return Number.parseInt(degC);
}

function kelvin2fahrenheit(degrees) {
  degrees = Number.parseInt(degrees);
  const degC = kelvin2celsius(degrees);
  const degF = degC * 1.8 + 32;
  return Number.parseInt(degF);
}

function formatTempString(degK, units, platform) {
  var string = '';
  if (units === 'C') {
    const degC = kelvin2celsius(degK);
    if (platform === 'irc') {
      switch (true) {
        case degC <= 0:
          string = `${ircColor.blue(degC)}°C`;
          break;
        case 0 < degC <= 30:
          string = `${ircColor.green(degC)}°C`;
          break;
        case 30 < degC:
          string = `${ircColor.red(degC)}°C`;
          break;
        default:
          string = `${degC}°C`;
          break;
      }
    }
  } else if (units === 'K') {
    // What kind of nerd wants temp in kelvin?
    string = `${degK}°K`;
  } else {
    const degF = kelvin2fahrenheit(degK);
    string = `${degF}°F`;
    if (platform === 'irc') {
      switch (true) {
        case degF <= 32:
          string = ircColor.blue(string);
          break;
        case 32 < degF <= 85:
          string = ircColor.green(string);
          break;
        case 85 < degF:
          string = ircColor.red(string);
          break;
        default:
          string = `${degF}°F`;
          break;
      }
    }
  }
  if (debug) console.log(string);
  return string;
}

// Code = weather.weather[0].id
function formatDescriptionString(description, code, platform) {
  var string = '';
  if (platform === 'irc') {
    switch (true) {
      case 200 <= code <= 232: // Thunderstorm
        string = ircColor.navy(description);
        break;
      case 300 <= code <= 321: // Drizzle
        string = ircColor.teal(description);
        break;
      case 500 <= code <= 531: // Rain
        string = ircColor.blue(description);
        break;
      case 600 <= code <= 622: // Snow
        string = ircColor.silver(description);
        break;
      case 700 <= code <= 781: // Atmosphere
        string = ircColor.gray(description);
        break;
      case 800 <= code <= 800: // Clear
        string = ircColor.cyan(description);
        break;
      case 801 <= code <= 804: // Clouds
        string = ircColor.gray(description);
        break;
      default:
        string = description;
        break;
    }
  }
  if (debug) console.log(string);
  return string;
}
