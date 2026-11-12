/** Value passed to Express `app.set('trust proxy', ...)`. */
export type TrustProxySetting = boolean | number | string;

const NAMED_SUBNETS = new Set(['loopback', 'linklocal', 'uniquelocal']);
// IPv4/IPv6 address characters with an optional /prefix (CIDR).
const IP_OR_CIDR = /^[0-9a-fA-F:.]+(\/[0-9]{1,3})?$/;

/**
 * Parses the TRUST_PROXY env value. Returns undefined when invalid.
 *
 *   "false" | ""        -> false (default: req.ip is the socket address)
 *   "true"              -> true  (trust every X-Forwarded-For hop; UNSAFE unless the app is
 *                                 only reachable through a proxy, because clients can spoof
 *                                 their IP and bypass rate limiting)
 *   "1", "2", ...       -> hop count (recommended behind one known reverse proxy: "1")
 *   "loopback, 10.0.0.0/8" -> list of trusted proxy addresses/subnets
 */
export function parseTrustProxy(raw: string): TrustProxySetting | undefined {
  const value = raw.trim();
  if (value === '' || value === 'false') return false;
  if (value === 'true') return true;
  if (/^[0-9]+$/.test(value)) {
    const hops = Number(value);
    return hops <= 32 ? hops : undefined;
  }
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return undefined;
  const valid = parts.every((p) => NAMED_SUBNETS.has(p) || IP_OR_CIDR.test(p));
  return valid ? parts.join(', ') : undefined;
}
