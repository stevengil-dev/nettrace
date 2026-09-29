'use strict';

// Minimal example: use NetTrace's core as a library.
//
//   export IP2LOCATION_API_KEY=your_key_here
//   node examples/quickstart.js

const { trace } = require('../src/trace');
const { IP2LocationClient } = require('../src/geolocate');

async function main() {
  const geoClient = new IP2LocationClient(); // reads IP2LOCATION_API_KEY

  // Demo mode geolocates a bundled, fixed hop list via the real API --
  // handy when traceroute itself is blocked in your environment.
  const result = await trace('example.com', { demo: true, geoClient });

  for (const hop of result.hops) {
    if (hop.timedOut) {
      console.log(`${hop.hop}. * * *`);
      continue;
    }
    const loc = hop.geo.isPrivate
      ? 'private network'
      : `${hop.geo.cityName}, ${hop.geo.countryName} (${hop.geo.isp})`;
    console.log(`${hop.hop}. ${hop.ip} — ${loc}`);
  }

  console.log('\nStats:', result.stats);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
