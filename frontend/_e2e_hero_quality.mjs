/** Verify homepage hero loads full-resolution background with no console errors. */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const MIN_HERO_BYTES = 1_000_000; // full-res PNG ~2.1MB

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

const failed = [];
page.on("requestfailed", (req) => failed.push(`${req.url()} — ${req.failure()?.errorText}`));

await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 120_000 });

const heroBg = page.locator(".pl-hero-bg").first();
await heroBg.waitFor({ state: "visible", timeout: 15_000 });

const style = await heroBg.evaluate((el) => getComputedStyle(el).backgroundImage);
const urlMatch = style.match(/url\(["']?([^"')]+)["']?\)/);
if (!urlMatch) throw new Error(`No background-image on .pl-hero-bg: ${style}`);
const bgUrl = urlMatch[1].startsWith("http") ? urlMatch[1] : new URL(urlMatch[1], BASE).href;

const res = await page.request.get(bgUrl);
const size = Number(res.headers()["content-length"] || 0);
const body = await res.body();
const actualSize = body.length;

const sectionBox = await page.locator(".pl-hero-section").boundingBox();
const overlayOpacity = await page.locator(".pl-hero-overlay").evaluate((el) => {
  const bg = getComputedStyle(el).backgroundColor;
  const m = bg.match(/rgba?\([^)]+\)/);
  return m ? m[0] : bg;
});
const heroTransform = await heroBg.evaluate((el) => getComputedStyle(el).transform);
const heroFilter = await heroBg.evaluate((el) => getComputedStyle(el).filter);

await page.screenshot({ path: "_e2e_artifacts/hero-quality-check.png", fullPage: false });

await browser.close();

const report = {
  bgUrl,
  contentLengthHeader: size,
  downloadedBytes: actualSize,
  minExpectedBytes: MIN_HERO_BYTES,
  fullResolution: actualSize >= MIN_HERO_BYTES,
  sectionHeight: sectionBox?.height,
  overlayBackground: overlayOpacity,
  heroTransform,
  heroFilter,
  consoleErrors,
  failedRequests: failed,
};

console.log(JSON.stringify(report, null, 2));

if (consoleErrors.length) process.exit(1);
if (failed.length) process.exit(1);
if (!report.fullResolution) {
  console.error("Hero image is not full resolution — expected >= 1MB");
  process.exit(1);
}
if (heroTransform !== "none") {
  console.error("Hero background still has transform:", heroTransform);
  process.exit(1);
}
if (heroFilter && heroFilter !== "none") {
  console.error("Hero background still has filter:", heroFilter);
  process.exit(1);
}

console.log("Hero quality check passed.");
