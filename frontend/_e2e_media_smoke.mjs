/**
 * Smoke: home + shop product images must load (no 404 media).
 * Run: node _e2e_media_smoke.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "_e2e_artifacts");
fs.mkdirSync(OUT, { recursive: true });

const BASE = process.env.E2E_BASE || "http://127.0.0.1:3000";
const API = process.env.E2E_API || "http://127.0.0.1:8000/api";

const summary = { ok: true, pages: [], failures: [], consoleErrors: [], networkFails: [] };

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") summary.consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    const u = res.url();
    if ((u.includes("/uploads/") || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u)) && res.status() >= 400) {
      summary.networkFails.push({ url: u, status: res.status() });
      summary.ok = false;
    }
  });

  // 1) Home
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.screenshot({ path: path.join(OUT, "audit-home.png"), fullPage: false });
  const heroSrc = await page.locator("img").first().getAttribute("src");
  summary.pages.push({ page: "home", heroSrc });

  // 2) Shop / product cards
  await page.goto(`${BASE}/shop`, { waitUntil: "networkidle", timeout: 60000 }).catch(async () => {
    // shop route may be /shop?type=posters
    await page.goto(`${BASE}/shop?type=posters`, { waitUntil: "networkidle", timeout: 60000 });
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "audit-shop.png"), fullPage: false });
  const cards = page.locator("[data-testid^=product-card-]");
  const n = await cards.count();
  summary.pages.push({ page: "shop", productCards: n });

  // Check broken images in DOM
  const broken = await page.evaluate(() => {
    return [...document.images]
      .filter((img) => img.src && img.naturalWidth === 0 && img.complete)
      .map((img) => img.src)
      .slice(0, 20);
  });
  if (broken.length) {
    summary.ok = false;
    summary.failures.push({ type: "broken-dom-images", broken });
  }

  // 3) Product detail of first API product
  const prods = await (await fetch(`${API}/products?limit=1`)).json();
  if (prods[0]?.slug) {
    await page.goto(`${BASE}/product/${prods[0].slug}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, "audit-pdp.png"), fullPage: false });
    const pdpBroken = await page.evaluate(() =>
      [...document.images].filter((img) => img.src && img.naturalWidth === 0 && img.complete).map((i) => i.src),
    );
    if (pdpBroken.length) {
      summary.ok = false;
      summary.failures.push({ type: "pdp-broken", pdpBroken });
    }
    summary.pages.push({ page: "pdp", slug: prods[0].slug, image: prods[0].images?.[0] });
  }

  // 4) Admin upload round-trip
  const login = await (await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ritheeshvaran2007@gmail.com", password: "admin123" }),
  })).json();
  const token = login.token;
  // 1x1 png
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const fd = new FormData();
  fd.append("file", new Blob([png], { type: "image/png" }), "audit.png");
  const up = await fetch(`${API}/admin/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const upBody = await up.json();
  summary.pages.push({ page: "admin-upload", status: up.status, url: upBody.url });
  if (!up.ok || !upBody.url) {
    summary.ok = false;
    summary.failures.push({ type: "upload-failed", upBody });
  } else {
    const mediaUrl = upBody.url.startsWith("http") ? upBody.url : `http://127.0.0.1:8000${upBody.url}`;
    const g = await fetch(mediaUrl);
    summary.pages.push({ page: "upload-fetch", status: g.status, mediaUrl });
    if (!g.ok) {
      summary.ok = false;
      summary.failures.push({ type: "upload-not-fetchable", mediaUrl, status: g.status });
    }
  }

  // Filter extension noise from console
  summary.consoleErrors = summary.consoleErrors.filter(
    (t) => !/Download the React DevTools|favicon|extension/i.test(t),
  );
  if (summary.consoleErrors.length) summary.ok = false;

  fs.writeFileSync(path.join(OUT, "media-smoke-summary.json"), JSON.stringify(summary, null, 2));
  await browser.close();
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
