'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUnixTraceroute, parseWindowsTracert } = require('../src/traceroute');

const UNIX_SAMPLE = `traceroute to google.com (142.250.72.14), 30 hops max, 60 byte packets
 1  _gateway (192.168.1.1)  1.234 ms  1.111 ms  1.098 ms
 2  10.0.0.1 (10.0.0.1)  5.678 ms  5.432 ms  5.321 ms
 3  * * *
 4  142.250.72.14 (142.250.72.14)  12.345 ms  11.987 ms  12.111 ms
`;

const WINDOWS_SAMPLE = `
Tracing route to google.com [142.250.72.14]
over a maximum of 30 hops:

  1     1 ms     1 ms     1 ms  192.168.1.1
  2     5 ms     5 ms     5 ms  10.0.0.1
  3     *        *        *     Request timed out.
  4    12 ms    12 ms    12 ms  dns.google [142.250.72.14]

Trace complete.
`;

test('parseUnixTraceroute: extracts hop number, ip, and rtt', () => {
  const hops = parseUnixTraceroute(UNIX_SAMPLE);
  assert.equal(hops.length, 4);

  assert.equal(hops[0].hop, 1);
  assert.equal(hops[0].ip, '192.168.1.1');
  assert.equal(hops[0].host, '_gateway');
  assert.equal(hops[0].rttMs, 1.234);
  assert.equal(hops[0].timedOut, false);
});

test('parseUnixTraceroute: hostname == ip is not treated as a hostname', () => {
  const hops = parseUnixTraceroute(UNIX_SAMPLE);
  assert.equal(hops[1].ip, '10.0.0.1');
  assert.equal(hops[1].host, null);
});

test('parseUnixTraceroute: "* * *" is a timeout with no ip', () => {
  const hops = parseUnixTraceroute(UNIX_SAMPLE);
  assert.equal(hops[2].hop, 3);
  assert.equal(hops[2].ip, null);
  assert.equal(hops[2].timedOut, true);
});

test('parseUnixTraceroute: final hop reaches the destination', () => {
  const hops = parseUnixTraceroute(UNIX_SAMPLE);
  assert.equal(hops[3].ip, '142.250.72.14');
  assert.equal(hops[3].rttMs, 12.345);
});

test('parseWindowsTracert: extracts hop number, ip, and rtt', () => {
  const hops = parseWindowsTracert(WINDOWS_SAMPLE);
  assert.equal(hops.length, 4);
  assert.equal(hops[0].hop, 1);
  assert.equal(hops[0].ip, '192.168.1.1');
  assert.equal(hops[0].rttMs, 1);
});

test('parseWindowsTracert: "Request timed out." is a timeout with no ip', () => {
  const hops = parseWindowsTracert(WINDOWS_SAMPLE);
  assert.equal(hops[2].hop, 3);
  assert.equal(hops[2].ip, null);
  assert.equal(hops[2].timedOut, true);
});

test('parseWindowsTracert: extracts ip from "host [ip]" on the final hop', () => {
  const hops = parseWindowsTracert(WINDOWS_SAMPLE);
  assert.equal(hops[3].ip, '142.250.72.14');
  assert.equal(hops[3].host, 'dns.google');
});
