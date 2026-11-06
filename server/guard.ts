// Blocks the two ways a web page can reach this unauthenticated loopback server:
// DNS rebinding (a foreign Host header) and cross-site requests (a foreign Origin header).
// Browsers always send Host, and send Origin on every cross-origin request (and on same-origin
// non-GET requests). CLI clients like curl send no Origin and are let through.

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

const hostnameOf = (hostHeader: string) => hostHeader.replace(/:\d+$/, '').toLowerCase();

/** Returns the reason a request is refused, or null if it may proceed. */
export function rejectReason(req: Request): string | null {
  const host = req.headers.get('host');
  if (host !== null && !LOOPBACK.has(hostnameOf(host))) return 'Host not allowed';

  const origin = req.headers.get('origin');
  if (origin === null) return null;
  let originHost: string;
  try {
    originHost = new URL(origin).hostname;
  } catch {
    return 'Origin not allowed'; // includes the opaque "null" origin
  }
  // URL.hostname keeps the brackets for IPv6 ("[::1]").
  return LOOPBACK.has(originHost.toLowerCase()) ? null : 'Origin not allowed';
}
