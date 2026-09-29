'use strict';

const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;

const app = createApp();
app.listen(PORT, () => {
  console.log(`NetTrace running at http://localhost:${PORT}`);
  if (!process.env.IP2LOCATION_API_KEY) {
    console.log(
      'No IP2LOCATION_API_KEY set -- running keyless (works fine, capped at 1,000 lookups/day). ' +
        'For higher limits, get a free key (50,000/month, no cost) at ' +
        'https://www.ip2location.io/sign-up'
    );
  }
});
