'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { trace } = require('../src/trace');

function fakeGeoClient(byIp) {
  return {
    lookup: async (ip) => byIp[ip] || { ip, isPrivate: false, latitude: null, longitude: null, countryName: null },
  };
}

test('trace() geolocates every hop with an ip and skips timeouts', async () => {
  const runTraceImpl = async () => [
    { hop: 1, ip: '192.168.1.1', host: null, rttMs: 1, timedOut: false },
    { hop: 2, ip: null, host: null, rttMs: null, timedOut: true },
    { hop: 3, ip: '8.8.8.8', host: null, rttMs: 20, timedOut: false },
  ];
  const geoClient = fakeGeoClient({
    '192.168.1.1': { ip: '192.168.1.1', isPrivate: true, latitude: null, longitude: null, countryName: null },
    '8.8.8.8': { ip: '8.8.8.8', isPrivate: false, latitude: 37.4, longitude: -122.0, countryName: 'United States' },
  });

  const result = await trace('example.com', { geoClient, runTraceImpl });

  assert.equal(result.hops.length, 3);
  assert.equal(result.hops[1].geo, null); // timeout, never looked up
  assert.equal(result.hops[2].geo.countryName, 'United States');
});

test('trace() in demo mode uses the bundled hop list, not runTraceImpl', async () => {
  let realTraceCalled = false;
  const runTraceImpl = async () => {
    realTraceCalled = true;
    return [];
  };
  const geoClient = fakeGeoClient({});

  const result = await trace('anything.example', { demo: true, geoClient, runTraceImpl });

  assert.equal(realTraceCalled, false);
  assert.equal(result.demo, true);
  assert.ok(result.hops.length > 0);
});

test('trace() throws a clear error without a geoClient', async () => {
  await assert.rejects(() => trace('example.com', {}), /requires a geoClient/);
});

test('trace() computes stats via pathStats over the geolocated hops', async () => {
  const runTraceImpl = async () => [
    { hop: 1, ip: '1.1.1.1', host: null, rttMs: 5, timedOut: false },
    { hop: 2, ip: '8.8.8.8', host: null, rttMs: 20, timedOut: false },
  ];
  const geoClient = fakeGeoClient({
    '1.1.1.1': { ip: '1.1.1.1', isPrivate: false, latitude: 0, longitude: 0, countryName: 'A' },
    '8.8.8.8': { ip: '8.8.8.8', isPrivate: false, latitude: 10, longitude: 10, countryName: 'B' },
  });

  const result = await trace('example.com', { geoClient, runTraceImpl });

  assert.equal(result.stats.detourRatio, 1);
  assert.deepEqual(result.stats.countries, ['A', 'B']);
});
