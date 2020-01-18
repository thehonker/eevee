'use strict';

const pm2 = require('pm2');

pm2.connect((err) => {
  if (err) {
    console.error(err);
    throw err;
  }

  pm2.start(
    {
      script: 'foo.js', // Script to be run
    },
    (err, apps) => {
      pm2.disconnect(); // Disconnects from PM2
      if (err) throw err;
    },
  );
});
