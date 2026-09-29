'use strict';

const { execFile } = require('child_process');
const os = require('os');

/**
 * One parsed hop from a traceroute run, before geolocation is attached.
 * @typedef {Object} RawHop
 * @property {number} hop        1-based hop index
 * @property {string|null} ip    IP address reached at this hop, or null on timeout
 * @property {string|null} host  Reverse-DNS hostname, if the OS reported one
 * @property {number|null} rttMs Round-trip time in ms (first sample), or null
 * @property {boolean} timedOut  True if every probe at this hop timed out (`* * *`)
 */

/**
 * Parse the text output of Unix `traceroute` (Linux/macOS).
 *
 * Typical line shapes:
 *   " 1  _gateway (192.168.1.1)  1.234 ms  1.111 ms  1.098 ms"
 *   " 2  142.250.72.14 (142.250.72.14)  12.345 ms  11.987 ms  12.111 ms"
 *   " 3  * * *"
 *
 * @param {string} output
 * @returns {RawHop[]}
 */
function parseUnixTraceroute(output) {
  const hops = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const m = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!m) continue;
    const hop = parseInt(m[1], 10);
    const rest = m[2].trim();

    if (!rest || /^\*(\s+\*)*$/.test(rest)) {
      hops.push({ hop, ip: null, host: null, rttMs: null, timedOut: true });
      continue;
    }

    // "hostname (ip)  time ms ..."  or  "ip (ip)  time ms ..." or bare "ip  time ms"
    let host = null;
    let ip = null;
    const parenMatch = rest.match(/^(\S+)\s+\(([\da-fA-F:.]+)\)/);
    if (parenMatch) {
      host = parenMatch[1] === parenMatch[2] ? null : parenMatch[1];
      ip = parenMatch[2];
    } else {
      const bareMatch = rest.match(/^([\da-fA-F:.]+)\b/);
      if (bareMatch && isIpLike(bareMatch[1])) {
        ip = bareMatch[1];
      }
    }

    const rttMatch = rest.match(/([\d.]+)\s*ms/);
    const rttMs = rttMatch ? parseFloat(rttMatch[1]) : null;

    hops.push({ hop, ip, host, rttMs, timedOut: ip === null });
  }

  return hops;
}

/**
 * Parse the text output of Windows `tracert`.
 *
 * Typical line shapes:
 *   "  1     1 ms     1 ms     1 ms  192.168.1.1"
 *   "  3     *        *        *     Request timed out."
 *   "  4    12 ms    12 ms    12 ms  dns.google [8.8.8.8]"
 *
 * @param {string} output
 * @returns {RawHop[]}
 */
function parseWindowsTracert(output) {
  const hops = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const m = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!m) continue;
    const hop = parseInt(m[1], 10);
    const rest = m[2].trim();

    if (/Request timed out/i.test(rest)) {
      hops.push({ hop, ip: null, host: null, rttMs: null, timedOut: true });
      continue;
    }

    const rttMatch = rest.match(/([\d.]+)\s*ms/);
    const rttMs = rttMatch ? parseFloat(rttMatch[1]) : null;

    // Destination is the trailing token, either "1.2.3.4" or "host [1.2.3.4]"
    const bracketMatch = rest.match(/(\S+)\s+\[([\da-fA-F:.]+)\]\s*$/);
    let host = null;
    let ip = null;
    if (bracketMatch) {
      host = bracketMatch[1];
      ip = bracketMatch[2];
    } else {
      const tail = rest.trim().split(/\s+/).pop();
      if (tail && isIpLike(tail)) ip = tail;
    }

    hops.push({ hop, ip, host, rttMs, timedOut: ip === null });
  }

  return hops;
}

function isIpLike(token) {
  return /^[\da-fA-F.:]+$/.test(token) && (token.includes('.') || token.includes(':'));
}

/**
 * Run the platform's traceroute tool against `target` and return parsed hops.
 *
 * @param {string} target      hostname or IP to trace
 * @param {Object} [opts]
 * @param {number} [opts.maxHops=30]
 * @param {number} [opts.timeoutMs=30000]  overall process timeout
 * @returns {Promise<RawHop[]>}
 */
function runTraceroute(target, opts = {}) {
  const maxHops = opts.maxHops || 30;
  const timeoutMs = opts.timeoutMs || 30000;
  const isWindows = os.platform() === 'win32';

  const cmd = isWindows ? 'tracert' : 'traceroute';
  const args = isWindows ? ['-h', String(maxHops), '-d', target] : ['-m', String(maxHops), '-n', target];
  // -n / -d: skip reverse DNS lookups so a trace doesn't hang on slow PTR records.

  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      // Some traceroute builds exit non-zero when the final hop is reached
      // via an unexpected port/ICMP type even though hops were captured, so
      // we still try to parse stdout before giving up.
      if (!stdout) {
        const hint = isWindows
          ? 'Is tracert available? It ships with Windows by default.'
          : `Is "traceroute" installed? Try: sudo apt install traceroute (Debian/Ubuntu) or it's preinstalled on macOS.`;
        return reject(
          new Error(`Could not run ${cmd} for "${target}". ${hint}\n${error ? error.message : ''}`)
        );
      }
      const hops = isWindows ? parseWindowsTracert(stdout) : parseUnixTraceroute(stdout);
      resolve(hops);
    });
  });
}

module.exports = { runTraceroute, parseUnixTraceroute, parseWindowsTracert };
