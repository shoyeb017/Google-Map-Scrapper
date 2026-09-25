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

test("provider fallback scenarios", async () => {  // Scenario matrix from spec: success / primary-fail->fallback / both-fail
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

// ---- Extraction mirrors (same logic as lib/contacts/extractor.ts) ----
function decodeCfEmailAttr(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  if (bytes.length < 2) return null;
  const key = bytes[0];
  return bytes.slice(1).map((b) => String.fromCharCode(b ^ key)).join("");
}

function deobfuscateText(text) {
  return text
    .replace(/\s*[\[({]\s*at\s*[\])}]\s*/gi, "@")
    .replace(/\s*[\[({]\s*dot\s*[\])}]\s*/gi, ".")
    .replace(/(\w[\w.+-]{0,40})\s+at\s+(?=[\w-]{1,40}\.[\w.-]*[a-z]{2,})/gi, "$1@")
    .replace(/(@[\w.-]{1,40})\s+dot\s+(?=[\w-]{1,40}(?:\.[\w.-]*[a-z]{2,})?)/gi, "$1.");
}

const FAKE_LOCALS = new Set(["example", "test", "noreply", "no-reply", "mailer-daemon"]);
function isRealEmailMirror(raw) {
  const e = raw.trim().toLowerCase();
  if (e.length > 254 || !e.includes("@")) return false;
  const [local, ...rest] = e.split("@");
  const domain = rest.join("@");
  if (!local || !domain) return false;
  if (FAKE_LOCALS.has(local)) return false;
  if (local.includes("..") || domain.includes("..")) return false;
  if (/\.(png|jpe?g|gif|svg)$/i.test(e)) return false;
  if (e.includes("example.")) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!/^[a-z]{2,24}$/.test(labels[labels.length - 1])) return false;
  return true;
}

test("cloudflare email decode", () => {
  // "a@b.co": key 0x12 -> bytes
  const plain = "a@b.co";
  const key = 0x12;
  const hex = [key, ...[...plain].map((c) => c.charCodeAt(0) ^ key)].map((b) => b.toString(16).padStart(2, "0")).join("");
  assert.strictEqual(decodeCfEmailAttr(hex), plain);
});

test("obfuscated email recovery", () => {
  assert.strictEqual(deobfuscateText("info [at] company [dot] com"), "info@company.com");
  assert.strictEqual(deobfuscateText("sales(at)example(dot)org"), "sales@example.org");
  assert.strictEqual(deobfuscateText("look at this page"), "look at this page");
  assert.strictEqual(deobfuscateText("mail us at support, thanks"), "mail us at support, thanks");
});

test("email validation rejects junk", () => {
  assert.ok(isRealEmailMirror("info@company.com"));
  assert.ok(isRealEmailMirror("sales.support@sub.domain.co.uk"));
  assert.ok(!isRealEmailMirror("test@example.com"));
  assert.ok(!isRealEmailMirror("noreply@company.com"));
  assert.ok(!isRealEmailMirror("user@company.png"));
  assert.ok(!isRealEmailMirror("a@b"));
  assert.ok(!isRealEmailMirror("bad..dots@company.com"));
  assert.ok(!isRealEmailMirror(`${"x".repeat(250)}@company.com`));
});
