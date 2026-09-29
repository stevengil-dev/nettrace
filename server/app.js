'use strict';

const path = require('path');
const express = require('express');
const { trace } = require('../src/trace');
const { runTraceroute } = require('../src/traceroute');
const { IP2LocationClient } = require('../src/geolocate');

/**
 * Builds the Express app. Dependencies are injectable so tests can run
 * without a real API key, a working traceroute binary, or network access.
 *
 * @param {Object} [deps]
 * @param {import('../src/geolocate').IP2LocationClient} [deps.geoClient]
 * @param {typeof runTraceroute} [deps.runTraceImpl]
 */
function createApp(deps = {}) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Lazily constructed so a missing API key doesn't crash app boot --
  // it only surfaces when someone actually hits /api/trace.
  let geoClient = deps.geoClient || null;
  const runTraceImpl = deps.runTraceImpl || runTraceroute;

  function getGeoClient() {
    if (!geoClient) geoClient = new IP2LocationClient();
    return geoClient;
  }

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/trace', async (req, res) => {
    const target = (req.body && req.body.target ? String(req.body.target) : '').trim();
    const demo = Boolean(req.body && req.body.demo);
    const maxHops = Number(req.body && req.body.maxHops) || 30;

    if (!target && !demo) {
      return res.status(400).json({ error: 'Missing "target" (hostname or IP to trace).' });
    }

    try {
      const client = getGeoClient();
      const result = await trace(target || 'demo', { demo, maxHops, geoClient: client, runTraceImpl });
      res.json(result);
    } catch (err) {
      // Upstream failures (traceroute not installed, IP2Location.io rate
      // limit hit, network error) surface as 502s the UI can show directly.
      res.status(502).json({ error: err.message });
    }
  });

  return app;
}

module.exports = { createApp };
