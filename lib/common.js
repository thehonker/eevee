'use strict';
const fs = require('fs');

exports.createProcDir = function() {
  const procPath = '/tmp/eevee';
  if (!fs.existsSync(procPath)) {
    fs.mkdirSync(procPath);
  }
  if (!fs.existsSync(`${procPath}/proc`)) {
    fs.mkdirSync(`${procPath}/proc`);
  }
  if (!fs.existsSync(`${procPath}/ipc`)) {
    fs.mkdirSync(`${procPath}/ipc`);
  }
  return procPath;
};
