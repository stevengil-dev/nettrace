'use strict';

const { runTraceroute } = require('./traceroute');
const { getDemoHops } = require('./demoData');
const { pathStats } = require('./geo');

/**
 * Run (or simulate, in demo mode) a traceroute to `target`, geolocate every
 * hop, and compute path statistics.
 *
 * @param {string} target
 * @param {Object} opts
 * @param {boolean} [opts.demo=false]   use the bundled demo hop list instead
 *                                       of actually running traceroute
 * @param {number} [opts.maxHops=30]
 * @param {import('./geolocate').IP2LocationClient} opts.geoClient  required
 * @param {(target: string, opts: object) => Promise<Array>} [opts.runTraceImpl]
 *        injectable for tests; defaults to the real runTraceroute
 * @returns {Promise<{target: string, demo: boolean, hops: Array, stats: Object}>}
 */
async function trace(target, opts = {}) {
  const { demo = false, maxHops = 30, geoClient, runTraceImpl = runTraceroute } = opts;
  if (!geoClient) {
    throw new Error('trace() requires a geoClient (see src/geolocate.js: IP2LocationClient)');
  }

  const rawHops = demo ? getDemoHops() : await runTraceImpl(target, { maxHops });

  const hops = [];
  for (const raw of rawHops) {
    if (!raw.ip) {
      hops.push({ ...raw, geo: null });
      continue;
    }
    const geo = await geoClient.lookup(raw.ip);
    hops.push({ ...raw, geo });
  }

  return { target, demo, hops, stats: pathStats(hops) };
}

module.exports = { trace };
