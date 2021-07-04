'use strict';

// Weather module. Takes in a zip code and displays the weather

const ident = 'weather';

import { default as clog } from 'ee-log';
import { default as ircColor } from 'irc-colors';
import { default as sqlite3 } from 'better-sqlite3';
import { default as needle } from 'needle';
import { default as imgur } from 'imgur';
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
    createUpdateWeatherLocation(request.args, request.nick)
      .then((dbInsertResult) => {
        if (debug) clog.debug(dbInsertResult);
        weather(request);
        return;
      })
      .catch((err) => {
        clog.error(err);
        const reply = {
          target: request.channel,
          text: `Error setting weather location: ${err.code}`,
        };
        if (debug) clog.debug(reply);
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
        return;
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
      .then((response) => {
        const weather = response.weather;
        const aqi = response.aqi;
        if (debug) clog.debug(weather, aqi);
        var string = '';
        const tempString = formatTempString(weather.main.temp, userData.units, request.platform);
        const descriptionString = formatDescriptionString(
          weather.weather[0].description,
          weather.weather[0].id,
          request.platform,
        );
        const humidityString = formatHumidityString(weather.main.humidity, request.platform);
        const windString = formatWindString(
          weather.wind.speed,
          weather.wind.gust,
          weather.wind.deg,
          userData.units,
          request.platform,
        );
        const aqiString = formatAqiString(aqi.list[0].main.aqi, request.platform);
        string = `[ ${weather.name} ][ ${descriptionString} ][ ${tempString} ][ ${humidityString} ][ ${windString} ] [ ${aqiString} ]`;
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
        const reply = {
          target: request.channel,
          text: `Error fetching weather data: ${err.code}`,
        };
        if (debug) clog.debug(reply);
        ipc.publish(`${request.replyTo}.outgoingMessage`, JSON.stringify(reply));
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
        if (debug) clog.debug('locationApi response', response.body);
        if (response.body.cod == '404') {
          let err = new Error('Location not found');
          err.code = 'E_API_404';
          clog.error(err);
          return reject(err);
        } else if (response.body.length == 0) {
          let err = new Error('Location not found');
          err.code = 'E_API_EMPTY_RESULT';
          clog.error(err);
          return reject(err);
        } else {
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
    needle.get(weatherApiUrl, (err, weatherResponse) => {
      if (err) {
        clog.error(err);
        return reject(err);
      }
      if (weatherResponse.body) {
        const aqiApiUrl = `http://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${config.apiKey}`;
        if (debug) clog.debug(aqiApiUrl);
        needle.get(aqiApiUrl, (err, aqiResponse) => {
          if (err) {
            clog.error(err);
            return reject(err);
          }
          if (aqiResponse.body) {
            if (debug) clog.debug(aqiResponse.body);
            return resolve({
              weather: weatherResponse.body,
              aqi: aqiResponse.body,
            });
          } else {
            let err = new Error('Error fetching current AQI data');
            err.code = 'E_AQI_API_CALL_FAILED';
            clog.error(err);
            return reject(err);
          }
        });
      } else {
        let err = new Error('Error fetching current weather data');
        err.code = 'E_WEATHER_API_CALL_FAILED';
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

function mps2mph(speed) {
  return Math.round(((speed * 3600) / 1610.3) * 1000) / 1000;
}

function formatTempString(degK, units, platform) {
  var string = '';
  if (units === 'C') {
    const degC = kelvin2celsius(degK);
    string = `${degC}°C`;
    if (platform === 'irc') {
      switch (true) {
        case degC <= 0:
          string = ircColor.blue(string);
          break;
        case degC >= 0 && degC <= 30:
          string = ircColor.green(string);
          break;
        case degC > 30:
          string = ircColor.red(string);
          break;
        default:
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
        case degF >= 32 && degF <= 75:
          string = ircColor.green(string);
          break;
        case degF > 75:
          string = ircColor.red(string);
          break;
        default:
          break;
      }
    }
  }
  if (debug) console.log(string);
  return string;
}

// Code = weather.weather[0].id
function formatDescriptionString(description, code, platform) {
  if (debug) clog.debug('descr, code', description, code);
  code = Number.parseInt(code);
  var string = '';
  if (platform === 'irc') {
    switch (true) {
      case code >= 200 && code <= 232: // Thunderstorm
        string = ircColor.navy(description);
        break;
      case code >= 300 && code <= 321: // Drizzle
        string = ircColor.teal(description);
        break;
      case code >= 500 && code <= 531: // Rain
        string = ircColor.blue(description);
        break;
      case code >= 600 && code <= 622: // Snow
        string = ircColor.silver(description);
        break;
      case code >= 700 && code <= 781: // Atmosphere
        string = ircColor.gray(description);
        break;
      case code == 800: // Clear
        string = ircColor.green(description);
        break;
      case code >= 801 && code <= 804: // Clouds
        string = ircColor.gray(description);
        break;
      default:
        string = description;
        break;
    }
  }
  return string;
}

function formatHumidityString(humidity, platform) {
  humidity = Number.parseInt(humidity);
  var string = `${humidity}%rh`;
  if (platform === 'irc') {
    switch (true) {
      case humidity < 30:
        string = ircColor.gray(string);
        break;
      case humidity >= 30 && humidity < 50:
        string = ircColor.green(string);
        break;
      case humidity >= 50 && humidity < 80:
        string = ircColor.blue(string);
        break;
      case 80 <= humidity:
        string = ircColor.red(string);
        break;
      default:
        break;
    }
  }
  return string;
}

function formatWindString(speed, gust, degrees, units, platform) {
  var string = '';
  if (debug) clog.debug(speed, gust, degrees, units, platform);
  var speedArray = [speed];
  if (gust) {
    speedArray[1] = gust;
  }
  if (units === 'C') {
    if (platform === 'irc') {
      for (let i = 0; i < speedArray.length; i++) {
        switch (true) {
          // eslint-disable-next-line security/detect-object-injection
          case speedArray[i] <= 10:
            // eslint-disable-next-line security/detect-object-injection
            speedArray[i] = ircColor.green(`${speedArray[i]}m/s`);
            break;
          // eslint-disable-next-line security/detect-object-injection
          case speedArray[i] >= 10 && speedArray[i] <= 20:
            // eslint-disable-next-line security/detect-object-injection
            speedArray[i] = ircColor.blue(`${speedArray[i]}m/s`);
            break;
          // eslint-disable-next-line security/detect-object-injection
          case speedArray[i] >= 20:
            // eslint-disable-next-line security/detect-object-injection
            speedArray[i] = ircColor.red(`${speedArray[i]}m/s`);
            break;
          default:
            // eslint-disable-next-line security/detect-object-injection
            speedArray[i] = `${speedArray[i]}m/s`;
            break;
        }
      }
    }
  } else {
    if (platform === 'irc') {
      for (let i = 0; i < speedArray.length; i++) {
        // eslint-disable-next-line security/detect-object-injection
        speedArray[i] = mps2mph(speedArray[i]);
        switch (true) {
          // eslint-disable-next-line security/detect-object-injection
          case speedArray[i] <= 10:
            // eslint-disable-next-line security/detect-object-injection
            speedArray[i] = ircColor.green(`${speedArray[i]}mph`);
            break;
          // eslint-disable-next-line security/detect-object-injection
          case speedArray[i] >= 10 && speedArray[i] <= 20:
            // eslint-disable-next-line security/detect-object-injection
            speedArray[i] = ircColor.blue(`${speedArray[i]}mph`);
            break;
          // eslint-disable-next-line security/detect-object-injection
          case speedArray[i] >= 20:
            // eslint-disable-next-line security/detect-object-injection
            speedArray[i] = ircColor.red(`${speedArray[i]}mph`);
            break;
          default:
            // eslint-disable-next-line security/detect-object-injection
            speedArray[i] = `${speedArray[i]}mph`;
            break;
        }
      }
    }
  }
  const compassSector = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
    'N',
  ];
  // eslint-disable-next-line prettier/prettier
  const compassSectorGraphical = [
    '🠩',
    '↗',
    '➡',
    '↘',
    '🠫',
    '↙',
    '⬅',
    '↖',
  ];
  const windDirection = compassSector[(degrees / 22.5).toFixed(0)];
  const windDirectionGraphical = compassSectorGraphical[(degrees / 45).toFixed(0)];
  if (gust) {
    string = `${speedArray[0]} (${windDirection}) (${speedArray[1]})`;
  } else {
    string = `${speedArray[0]} (${windDirection})`;
  }
  return string;
}

function formatAqiString(aqi, platform) {
  if (debug) clog.debug(aqi, platform);
  var string = null;
  switch (aqi) {
    case 1:
      string = 'AQI: Good';
      break;
    case 2:
      string = 'AQI: Fair';
      break;
    case 3:
      string = 'AQI: Moderate';
      break;
    case 4:
      string = 'AQI: Poor';
      break;
    case 5:
      string = 'AQI: Very Poor';
      break;
    default:
      break;
  }

  if (platform === 'irc') {
    switch (aqi) {
      case 1:
        string = ircColor.green('AQI: Good');
        break;
      case 2:
        string = ircColor.green('AQI: Fair');
        break;
      case 3:
        string = ircColor.blue('AQI: Moderate');
        break;
      case 4:
        string = ircColor.red('AQI: Poor');
        break;
      case 5:
        string = ircColor.red('AQI: Very Poor');
        break;
      default:
        break;
    }
  }
  if (debug) clog.debug(string);
  return string;
}
