import dns from "node:dns/promises";
import net from "node:net";

// SSRF protection: block private/internal targets before any server-side fetch/crawl.
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
  "instance-data",
  "instance-data-compute",
  "169.254.169.254",
]);

function isPrivateIp(ip: string): boolean {
  if (!net.isIP(ip)) return false;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a >= 224) return true;
    return false;
  }
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::") return true;
  if (low.startsWith("fc") || low.startsWith("fd")) return true;
  if (low.startsWith("fe80")) return true;
  return false;
}

export async function assertUrlSafe(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (!["http:", "https:"].includes(u.protocol)) {
    throw new Error(`Blocked protocol: ${u.protocol}`);
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".internal")) {
    throw new Error(`Blocked host: ${host}`);
  }
  if (net.isIP(host) && isPrivateIp(host)) {
    throw new Error(`Blocked IP literal: ${host}`);
  }
  try {
    const records = await dns.lookup(host, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        throw new Error(`Blocked resolved address ${r.address} for ${host}`);
      }
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message.startsWith("Blocked resolved")) throw e;
    throw new Error(`DNS resolution failed for ${host}`);
  }
  return u;
}

export function isRateLimitedError(message: string): boolean {
  return /429|rate|quota|over_query|RESOURCE_EXHAUSTED/i.test(message);
}
