#!/usr/bin/env node
'use strict';

const { trace } = require('../src/trace');
const { IP2LocationClient } = require('../src/geolocate');

function parseArgs(argv) {
  const args = { target: null, demo: false, json: false, maxHops: 30 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--demo') args.demo = true;
    else if (a === '--json') args.json = true;
    else if (a === '--max-hops') args.maxHops = parseInt(argv[++i], 10) || 30;
    else if (a === '-h' || a === '--help') args.help = true;
    else if (!args.target) args.target = a;
  }
  return args;
}

function printHelp() {
  console.log(`nettrace - traceroute, geolocated hop by hop via IP2Location.io

Usage:
  nettrace <host>              Trace a real target (needs traceroute/tracert installed)
  nettrace --demo              Use the bundled demo hop list (no traceroute needed)
  nettrace <host> --json       Print raw JSON instead of a table
  nettrace <host> --max-hops N Limit the number of hops (default 30)

Requires no setup to try (keyless mode works up to 1,000 lookups/day).
For higher limits, set IP2LOCATION_API_KEY to a free key (50,000/month, no cost):
https://www.ip2location.io/sign-up
`);
}

function padRight(str, len) {
  str = String(str);
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function printTable(result) {
  console.log(`\nTrace to ${result.demo ? '(demo data)' : result.target}\n`);
  console.log(
    padRight('#', 3) + padRight('IP', 17) + padRight('Location', 30) + padRight('ISP', 22) + 'RTT'
  );
  console.log('-'.repeat(85));

  for (const hop of result.hops) {
    if (hop.timedOut) {
      console.log(padRight(hop.hop, 3) + padRight('* * *', 17) + 'no response');
      continue;
    }
    const geo = hop.geo || {};
    const location = geo.isPrivate
      ? 'private network'
      : [geo.cityName, geo.countryName].filter(Boolean).join(', ') || 'unknown';
    const rtt = hop.rttMs != null ? `${hop.rttMs} ms` : '';
    console.log(
      padRight(hop.hop, 3) +
        padRight(hop.ip || '', 17) +
        padRight(location, 30) +
        padRight(geo.isp || '', 22) +
        rtt
    );
  }

  const s = result.stats;
  console.log('\n' + '-'.repeat(85));
  if (s.detourRatio != null) {
    console.log(
      `Routed distance: ${s.routedKm} km   Direct distance: ${s.directKm} km   Detour ratio: ${s.detourRatio}x`
    );
  }
  if (s.countries.length) {
    console.log(`Countries crossed: ${s.countries.join(' -> ')}`);
  }
  console.log();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.target && !args.demo)) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  let geoClient;
  try {
    geoClient = new IP2LocationClient();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (geoClient.keyless) {
    console.error('(no IP2LOCATION_API_KEY set -- running keyless, capped at 1,000 lookups/day)\n');
  }

  try {
    const result = await trace(args.target || 'demo', {
      demo: args.demo,
      maxHops: args.maxHops,
      geoClient,
    });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printTable(result);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
