'use strict';

const API_URL = 'https://api.ip2location.io/';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

class GeoLookupError extends Error {}

/**
 * Normalized subset of an IP2Location.io response, plus the raw payload.
 * @typedef {Object} GeoInfo
 * @property {string} ip
 * @property {boolean} isPrivate
 * @property {string|null} countryCode
 * @property {string|null} countryName
 * @property {string|null} regionName
 * @property {string|null} cityName
 * @property {number|null} latitude
 * @property {number|null} longitude
 * @property {string|null} isp
 * @property {string|null} asn      e.g. "AS15169"
 * @property {string|null} as       ASN organization name
 * @property {boolean} isProxy
 * @property {Object} raw
 */

/**
 * Looks up geolocation + network-ownership info for IPs, with an in-memory
 * cache and a short-circuit for private/reserved addresses (common on the
 * first hop or two of any traceroute -- your own router, your ISP's CGNAT,
 * etc -- which IP2Location.io can't geolocate anyway).
 */
class IP2LocationClient {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.apiKey]      defaults to process.env.IP2LOCATION_API_KEY.
   *                                     Optional: IP2Location.io can be queried
   *                                     keyless for up to 1,000 lookups/day. A
   *                                     free key (sign up, no cost) raises that
   *                                     to 50,000/month -- see keyless below.
   * @param {number} [opts.cacheTtlMs]
   * @param {number} [opts.timeoutMs]
   * @param {typeof fetch} [opts.fetchImpl]  inject a fake fetch for tests
   */
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || process.env.IP2LOCATION_API_KEY || null;
    this.keyless = !this.apiKey;
    this.cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl || globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error('No fetch implementation available. Use Node 18+, or pass { fetchImpl }.');
    }
    this._cache = new Map(); // ip -> { fetchedAt, geo }
  }

  /**
   * @param {string} ip
   * @returns {Promise<GeoInfo>}
   */
  async lookup(ip) {
    const cleanIp = ip.trim();

    if (isPrivateOrReserved(cleanIp)) {
      return {
        ip: cleanIp,
        isPrivate: true,
        countryCode: null,
        countryName: 'Private network',
        regionName: null,
        cityName: 'N/A (non-routable address)',
        latitude: null,
        longitude: null,
        isp: null,
        asn: null,
        as: null,
        isProxy: false,
        raw: { note: 'private/reserved address, not sent to API' },
      };
    }

    const cached = this._getCached(cleanIp);
    if (cached) return cached;

    const geo = await this._fetch(cleanIp);
    this._cache.set(cleanIp, { fetchedAt: Date.now(), geo });
    return geo;
  }

  _getCached(ip) {
    const entry = this._cache.get(ip);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > this.cacheTtlMs) {
      this._cache.delete(ip);
      return null;
    }
    return entry.geo;
  }

  async _fetch(ip) {
    const params = new URLSearchParams({ ip, format: 'json' });
    if (this.apiKey) params.set('key', this.apiKey);
    const url = `${API_URL}?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await this.fetchImpl(url, { signal: controller.signal });
    } catch (err) {
      throw new GeoLookupError(`Could not reach IP2Location.io for ${ip}: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new GeoLookupError(`IP2Location.io returned a non-JSON response for ${ip}`);
    }

    if (data.error) {
      throw new GeoLookupError(`IP2Location.io error for ${ip}: ${data.error.error_message || 'unknown error'}`);
    }

    return parseGeoResponse(ip, data);
  }
}

function parseGeoResponse(ip, data) {
  return {
    ip,
    isPrivate: false,
    countryCode: data.country_code ?? null,
    countryName: data.country_name ?? null,
    regionName: data.region_name ?? null,
    cityName: data.city_name ?? null,
    latitude: typeof data.latitude === 'number' ? data.latitude : null,
    longitude: typeof data.longitude === 'number' ? data.longitude : null,
    isp: data.isp ?? null,
    asn: data.asn ?? null,
    as: data.as ?? null,
    isProxy: Boolean(data.is_proxy),
    raw: data,
  };
}

/**
 * Best-effort check for private/loopback/link-local/reserved IPv4 and IPv6
 * addresses, without pulling in Node's stricter `net` module helpers (which
 * don't expose an "is private" check directly).
 */
function isPrivateOrReserved(ip) {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
  }

  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 0) return true; // "this network"
  return false;
}

module.exports = { IP2LocationClient, GeoLookupError, isPrivateOrReserved };
