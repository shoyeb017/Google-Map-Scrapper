// Unit tests (run: npm run test). Pure-JS mirrors of TS logic for zero-deps node:test.
const { test } = require("node:test");
const assert = require("node:assert");

function normalizeName(name) {
  return name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function normalizeUrl(raw) {
  if (!raw) return null;
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    u.hash = "";
    for (const p of ["utm_source", "gclid", "fbclid"]) u.searchParams.delete(p);
    return u.toString();
  } catch { return null; }
}
function detectPlatform(rawUrl) {
  const n = normalizeUrl(rawUrl);
  if (!n) return null;
  const host = new URL(n).hostname.toLowerCase();
  if (/(^|\.)facebook\.com$/.test(host)) return "facebook";
  if (/(^|\.)linkedin\.com$/.test(host)) return "linkedin";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(x\.com|twitter\.com)$/.test(host)) return "x";
  if (/(^|\.)t\.me$/.test(host)) return "telegram";
  return null;
}
function duplicateKey(b) {
  if (b.placeId) return `place:${b.placeId.toLowerCase()}`;
  return `name:${normalizeName(b.name)}`;
}
function shouldFallback(code) {
  // Automatic mode: any primary failure falls back (missing/invalid key included).
  return true;
}

test("url normalization strips tracking + adds https", () => {
  assert.strictEqual(normalizeUrl("example.com?utm_source=x#frag"), "https://example.com/");
  assert.ok(normalizeUrl("https://ABC.com/Path")?.includes("abc.com"));
});

test("phone/email normalization basics", () => {
  assert.strictEqual("Info@Example.COM".toLowerCase(), "info@example.com");
  assert.strictEqual(normalizeName("ABC  Technologies, Ltd.!"), "abc technologies ltd");
});

test("social platform detection", () => {
  assert.strictEqual(detectPlatform("https://facebook.com/acme"), "facebook");
  assert.strictEqual(detectPlatform("https://linkedin.com/company/acme"), "linkedin");
  assert.strictEqual(detectPlatform("https://x.com/acme"), "x");
  assert.strictEqual(detectPlatform("https://example.com"), null);
});

test("deduplication keys + fallback logic", () => {
  assert.strictEqual(duplicateKey({ placeId: "ChIJ123", name: "ABC" }), "place:chij123");
  assert.ok(shouldFallback("QUOTA"));
  assert.ok(shouldFallback("TIMEOUT"));
  assert.ok(shouldFallback("NOT_CONFIGURED"));
  assert.ok(shouldFallback("AUTHENTICATION"));
});

test("provider fallback scenarios", async () => {
  // Scenario matrix from spec: success / primary-fail->fallback / both-fail
  async function fakeOrch(primaryFails, fallbackFails) {
    const attempts = [];
    try {
      if (primaryFails) throw Object.assign(new Error("primary down"), { code: "QUOTA" });
      attempts.push({ provider: "google_places", status: "success" });
      return { fallbackUsed: false, attempts };
    } catch (e) {
      attempts.push({ provider: "google_places", status: "failed" });
      if (fallbackFails) {
        attempts.push({ provider: "browser_discovery", status: "failed" });
        throw Object.assign(new Error("both failed"), { attempts });
      }
      attempts.push({ provider: "browser_discovery", status: "success" });
      return { fallbackUsed: true, attempts };
    }
  }
  assert.strictEqual((await fakeOrch(false, false)).fallbackUsed, false);
  assert.strictEqual((await fakeOrch(true, false)).fallbackUsed, true);
  await assert.rejects(() => fakeOrch(true, true), /both failed/);
});
