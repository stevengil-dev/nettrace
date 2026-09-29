'use strict';

/**
 * Demo mode skips *running* traceroute (which needs raw-socket/ICMP
 * permissions that a lot of sandboxes, containers, and corporate networks
 * block) but still performs real, live geolocation lookups against the
 * IP2Location.io API for a fixed, illustrative set of well-known public
 * IPs. This means `--demo` still requires a valid IP2LOCATION_API_KEY and
 * still demonstrates the actual API integration end to end -- it just
 * removes the dependency on traceroute being runnable in your environment.
 *
 * The hops below are NOT the real route to whatever target you pass; they're
 * a fixed, illustrative multi-hop path through well-known public resolvers
 * (Cloudflare, Quad9, Google, OpenDNS) so the map always has something
 * interesting and geographically spread out to draw.
 */
function getDemoHops() {
  return [
    { hop: 1, ip: '192.168.1.1', host: '_gateway', rttMs: 1.2, timedOut: false },
    { hop: 2, ip: '100.100.100.1', host: null, rttMs: 8.5, timedOut: false },
    { hop: 3, ip: '1.1.1.1', host: 'one.one.one.one', rttMs: 15.3, timedOut: false },
    { hop: 4, ip: '9.9.9.9', host: 'dns.quad9.net', rttMs: 40.2, timedOut: false },
    { hop: 5, ip: null, host: null, rttMs: null, timedOut: true },
    { hop: 6, ip: '8.8.8.8', host: 'dns.google', rttMs: 62.4, timedOut: false },
    { hop: 7, ip: '208.67.222.222', host: 'resolver1.opendns.com', rttMs: 70.1, timedOut: false },
    { hop: 8, ip: '8.8.4.4', host: 'dns.google', rttMs: 85.6, timedOut: false },
  ];
}

module.exports = { getDemoHops };
