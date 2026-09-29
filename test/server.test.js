'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');

function fakeGeoClient() {
  return {
    lookup: async (ip) => ({
      ip,
      isPrivate: false,
      countryCode: 'US',
      countryName: 'United States',
      cityName: 'Springfield',
      latitude: 39.78,
      longitude: -89.65,
      isp: 'Test ISP',
      isProxy: false,
    }),
  };
}

async function withServer(deps, fn) {
  const app = createApp(deps);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /api/health responds ok', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
});

test('POST /api/trace with no target and no demo flag is a 400', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/trace with demo:true returns geolocated hops and stats', async () => {
  const runTraceImpl = async () => {
    throw new Error('real traceroute should not run in demo mode');
  };
  await withServer({ geoClient: fakeGeoClient(), runTraceImpl }, async (base) => {
    const res = await fetch(`${base}/api/trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demo: true }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.demo, true);
    assert.ok(body.hops.length > 0);
    assert.ok('detourRatio' in body.stats);
  });
});

test('POST /api/trace with a target calls the injected traceroute implementation', async () => {
  let calledWith = null;
  const runTraceImpl = async (target) => {
    calledWith = target;
    return [{ hop: 1, ip: '8.8.8.8', host: null, rttMs: 5, timedOut: false }];
  };
  await withServer({ geoClient: fakeGeoClient(), runTraceImpl }, async (base) => {
    const res = await fetch(`${base}/api/trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'example.com' }),
    });
    assert.equal(res.status, 200);
    assert.equal(calledWith, 'example.com');
  });
});

test('POST /api/trace surfaces traceroute errors as a 502', async () => {
  const runTraceImpl = async () => {
    throw new Error('traceroute: command not found');
  };
  await withServer({ geoClient: fakeGeoClient(), runTraceImpl }, async (base) => {
    const res = await fetch(`${base}/api/trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'example.com' }),
    });
    assert.equal(res.status, 502);
  });
});
