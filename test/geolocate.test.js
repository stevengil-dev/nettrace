'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { IP2LocationClient, GeoLookupError, isPrivateOrReserved } = require('../src/geolocate');

const SAMPLE_RESPONSE = {
  ip: '8.8.8.8',
  country_code: 'US',
  country_name: 'United States of America',
  region_name: 'California',
  city_name: 'Mountain View',
  latitude: 37.4056,
  longitude: -122.0775,
  isp: 'Google LLC',
  asn: 'AS15169',
  as: 'Google LLC',
  is_proxy: false,
};

function fakeFetch(responseMap) {
  let calls = 0;
  const fn = async (url) => {
    calls++;
    const ip = new URL(url).searchParams.get('ip');
    const payload = responseMap[ip] ?? { error: { error_message: 'not found' } };
    return { json: async () => payload };
  };
  fn.getCalls = () => calls;
  return fn;
}

test('lookup() parses a normal response', async () => {
  const fetchImpl = fakeFetch({ '8.8.8.8': SAMPLE_RESPONSE });
  const client = new IP2LocationClient({ apiKey: 'test-key', fetchImpl });

  const geo = await client.lookup('8.8.8.8');

  assert.equal(geo.countryCode, 'US');
  assert.equal(geo.cityName, 'Mountain View');
  assert.equal(geo.latitude, 37.4056);
  assert.equal(geo.isp, 'Google LLC');
  assert.equal(geo.isPrivate, false);
});

test('lookup() caches repeat queries for the same IP', async () => {
  const fetchImpl = fakeFetch({ '8.8.8.8': SAMPLE_RESPONSE });
  const client = new IP2LocationClient({ apiKey: 'test-key', fetchImpl });

  await client.lookup('8.8.8.8');
  await client.lookup('8.8.8.8');

  assert.equal(fetchImpl.getCalls(), 1);
});

test('lookup() never calls the network for private IPv4 ranges', async () => {
  const fetchImpl = fakeFetch({});
  const client = new IP2LocationClient({ apiKey: 'test-key', fetchImpl });

  const geo = await client.lookup('192.168.1.1');

  assert.equal(geo.isPrivate, true);
  assert.equal(geo.latitude, null);
  assert.equal(fetchImpl.getCalls(), 0);
});

test('lookup() throws GeoLookupError on an API error payload', async () => {
  const fetchImpl = fakeFetch({});
  const client = new IP2LocationClient({ apiKey: 'test-key', fetchImpl });

  await assert.rejects(() => client.lookup('1.2.3.4'), GeoLookupError);
});

test('lookup() includes the key param when an apiKey is provided', async () => {
  let seenUrl = null;
  const fetchImpl = async (url) => {
    seenUrl = url;
    return { json: async () => SAMPLE_RESPONSE };
  };
  const client = new IP2LocationClient({ apiKey: 'test-key', fetchImpl });

  await client.lookup('8.8.8.8');

  assert.equal(new URL(seenUrl).searchParams.get('key'), 'test-key');
});

test('constructor does not throw without an API key -- falls back to keyless mode', () => {
  const client = new IP2LocationClient({ apiKey: undefined, fetchImpl: async () => ({ json: async () => ({}) }) });
  assert.equal(client.keyless, true);
});

test('lookup() omits the key param entirely in keyless mode', async () => {
  let seenUrl = null;
  const fetchImpl = async (url) => {
    seenUrl = url;
    return { json: async () => SAMPLE_RESPONSE };
  };
  const client = new IP2LocationClient({ apiKey: undefined, fetchImpl });

  await client.lookup('8.8.8.8');

  assert.equal(new URL(seenUrl).searchParams.has('key'), false);
});

test('isPrivateOrReserved: recognizes common private/reserved ranges', () => {
  assert.equal(isPrivateOrReserved('192.168.1.1'), true);
  assert.equal(isPrivateOrReserved('10.0.0.5'), true);
  assert.equal(isPrivateOrReserved('172.16.5.5'), true);
  assert.equal(isPrivateOrReserved('127.0.0.1'), true);
  assert.equal(isPrivateOrReserved('100.64.0.1'), true);
  assert.equal(isPrivateOrReserved('::1'), true);
});

test('isPrivateOrReserved: leaves public IPs alone', () => {
  assert.equal(isPrivateOrReserved('8.8.8.8'), false);
  assert.equal(isPrivateOrReserved('1.1.1.1'), false);
});
