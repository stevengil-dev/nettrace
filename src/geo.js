'use strict';

const EARTH_RADIUS_KM = 6371.0;

/**
 * Great-circle distance between two lat/lon points, in kilometers.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Given an ordered list of hops that each have geo.latitude/geo.longitude
 * (hops without coordinates -- private IPs, timeouts -- are skipped),
 * compute:
 *   - routedKm: sum of hop-to-hop distances (the path packets actually took)
 *   - directKm: straight-line distance from the first to the last located hop
 *   - detourRatio: routedKm / directKm (1.0 = perfectly direct, >1 = indirect)
 *   - countries: ordered list of distinct countries the path passed through
 */
function pathStats(hops) {
  const located = hops.filter(
    (h) => h.geo && typeof h.geo.latitude === 'number' && typeof h.geo.longitude === 'number'
  );

  if (located.length < 2) {
    return { routedKm: 0, directKm: 0, detourRatio: null, countries: dedupeCountries(located) };
  }

  let routedKm = 0;
  for (let i = 1; i < located.length; i++) {
    routedKm += haversineKm(
      located[i - 1].geo.latitude,
      located[i - 1].geo.longitude,
      located[i].geo.latitude,
      located[i].geo.longitude
    );
  }

  const first = located[0];
  const last = located[located.length - 1];
  const directKm = haversineKm(first.geo.latitude, first.geo.longitude, last.geo.latitude, last.geo.longitude);

  return {
    routedKm: round1(routedKm),
    directKm: round1(directKm),
    detourRatio: directKm > 0 ? round2(routedKm / directKm) : null,
    countries: dedupeCountries(located),
  };
}

function dedupeCountries(located) {
  const seen = new Set();
  const ordered = [];
  for (const hop of located) {
    const name = hop.geo.countryName;
    if (name && !seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  }
  return ordered;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { haversineKm, pathStats };
