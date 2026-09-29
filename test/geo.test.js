'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineKm, pathStats } = require('../src/geo');

test('haversineKm returns ~0 for the same point', () => {
  const d = haversineKm(3.139, 101.6869, 3.139, 101.6869);
  assert.ok(Math.abs(d) < 1e-6);
});

test('haversineKm: Kuala Lumpur to Singapore is roughly 300-330km', () => {
  const d = haversineKm(3.139, 101.6869, 1.3521, 103.8198);
  assert.ok(d > 280 && d < 350, `expected ~300km, got ${d}`);
});

function hop(lat, lon, countryName) {
  return { geo: { latitude: lat, longitude: lon, countryName } };
}

test('pathStats: fewer than 2 located hops yields no ratio', () => {
  const stats = pathStats([hop(1, 1, 'A')]);
  assert.equal(stats.detourRatio, null);
  assert.equal(stats.routedKm, 0);
});

test('pathStats: a perfectly direct 2-hop path has detourRatio 1', () => {
  const stats = pathStats([hop(0, 0, 'A'), hop(10, 10, 'B')]);
  assert.equal(stats.routedKm, stats.directKm);
  assert.equal(stats.detourRatio, 1);
});

test('pathStats: a zig-zagging path has detourRatio > 1', () => {
  // 0,0 -> 10,0 -> 0,10 -> 10,10 zig-zags rather than going straight there
  const stats = pathStats([hop(0, 0, 'A'), hop(10, 0, 'B'), hop(0, 10, 'C'), hop(10, 10, 'D')]);
  assert.ok(stats.detourRatio > 1, `expected > 1, got ${stats.detourRatio}`);
});

test('pathStats: skips hops without coordinates (timeouts, private IPs)', () => {
  const stats = pathStats([hop(0, 0, 'A'), { geo: null }, hop(10, 10, 'B')]);
  assert.equal(stats.detourRatio, 1);
});

test('pathStats: dedupes consecutive same-country hops but keeps order', () => {
  const stats = pathStats([hop(0, 0, 'Malaysia'), hop(1, 1, 'Malaysia'), hop(10, 10, 'Singapore')]);
  assert.deepEqual(stats.countries, ['Malaysia', 'Singapore']);
});
