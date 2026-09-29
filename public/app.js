'use strict';

const form = document.getElementById('traceForm');
const targetInput = document.getElementById('target');
const demoCheckbox = document.getElementById('demo');
const traceBtn = document.getElementById('traceBtn');
const errorBanner = document.getElementById('errorBanner');
const statsEl = document.getElementById('stats');
const hopListEl = document.getElementById('hopList');

const map = L.map('map', { worldCopyJump: true }).setView([20, 0], 2);

// Esri's "World Dark Gray Canvas" tiles: free, no API key or account
// required (unlike CARTO's basemaps.cartocdn.com, which started requiring
// a key in August 2026). Base layer + a transparent "reference" layer for
// labels/boundaries on top, which is how Esri splits this basemap in two.
const darkGrayBase = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 19,
    maxNativeZoom: 16, // Esri's source imagery tops out at z16; Leaflet upscales beyond that
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors, and the GIS community',
  }
);
const darkGrayLabels = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 19, maxNativeZoom: 16 }
);
darkGrayBase.addTo(map);
darkGrayLabels.addTo(map);

let markers = [];
let polyline = null;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const target = targetInput.value.trim();
  const demo = demoCheckbox.checked;

  if (!target && !demo) {
    showError('Enter a target host/IP, or check "Demo mode".');
    return;
  }

  setLoading(true);
  hideError();

  try {
    const res = await fetch('/api/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, demo, maxHops: 30 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    render(data);
  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
  }
});

function setLoading(loading) {
  traceBtn.disabled = loading;
  traceBtn.textContent = loading ? 'Tracing…' : 'Run trace';
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}
function hideError() {
  errorBanner.hidden = true;
}

function render(data) {
  renderStats(data.stats);
  renderHopList(data.hops);
  renderMap(data.hops);
}

function renderStats(stats) {
  document.getElementById('statRouted').textContent = stats.routedKm ? `${formatKm(stats.routedKm)}` : '—';
  document.getElementById('statDirect').textContent = stats.directKm ? `${formatKm(stats.directKm)}` : '—';
  document.getElementById('statDetour').textContent = stats.detourRatio ? `${stats.detourRatio}×` : '—';
  document.getElementById('statCountries').textContent = stats.countries.length
    ? stats.countries.join(' → ')
    : '—';
  statsEl.hidden = false;
}

function formatKm(km) {
  return `${km.toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
}

function renderHopList(hops) {
  hopListEl.innerHTML = '';
  for (const hop of hops) {
    const li = document.createElement('li');

    const dot = document.createElement('span');
    dot.className = 'hop-dot' + (hop.timedOut ? ' timeout' : hop.geo && hop.geo.isPrivate ? ' private' : '');

    const num = document.createElement('span');
    num.className = 'hop-num';
    num.textContent = hop.hop;

    const body = document.createElement('div');
    body.className = 'hop-body';

    if (hop.timedOut) {
      body.innerHTML = `<div class="hop-ip">* * *</div><div class="hop-loc">no response</div>`;
    } else {
      const ip = document.createElement('div');
      ip.className = 'hop-ip';
      ip.textContent = hop.ip + (hop.host ? `  (${hop.host})` : '');

      const loc = document.createElement('div');
      loc.className = 'hop-loc';
      loc.textContent = hop.geo
        ? hop.geo.isPrivate
          ? 'Private network'
          : [hop.geo.cityName, hop.geo.countryName].filter(Boolean).join(', ') +
            (hop.geo.isp ? ` — ${hop.geo.isp}` : '')
        : 'Unknown';

      const rtt = document.createElement('div');
      rtt.className = 'hop-rtt';
      rtt.textContent = hop.rttMs != null ? `${hop.rttMs} ms` : '';

      body.append(ip, loc, rtt);
    }

    li.append(num, dot, body);
    hopListEl.appendChild(li);
  }
}

function renderMap(hops) {
  markers.forEach((m) => map.removeLayer(m));
  markers = [];
  if (polyline) map.removeLayer(polyline);

  const points = [];
  hops.forEach((hop, i) => {
    if (!hop.geo || hop.geo.isPrivate || hop.geo.latitude == null) return;
    const latlng = [hop.geo.latitude, hop.geo.longitude];
    points.push(latlng);

    const marker = L.circleMarker(latlng, {
      radius: 6,
      color: '#2dd4bf',
      fillColor: '#2dd4bf',
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map);

    marker.bindPopup(
      `<strong>Hop ${hop.hop}: ${hop.ip}</strong><br>` +
        `${[hop.geo.cityName, hop.geo.countryName].filter(Boolean).join(', ')}<br>` +
        `${hop.geo.isp || ''}` +
        (hop.rttMs != null ? `<br>${hop.rttMs} ms` : '')
    );
    markers.push(marker);
  });

  if (points.length > 1) {
    polyline = L.polyline(points, { color: '#2dd4bf', weight: 2, opacity: 0.7, dashArray: '4 6' }).addTo(map);
    map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
  } else if (points.length === 1) {
    map.setView(points[0], 6);
  }
}
