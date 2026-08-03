/** Fail if any image/media request 404s or console errors on key pages. */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const API = process.env.API_URL || "http://127.0.0.1:8000";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
const badResponses = [];

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

page.on("response", (res) => {
  const url = res.url();
  const type = res.request().resourceType();
  if ((type === "image" || /\/uploads\//.test(url) || /supabase\.co\/storage/.test(url)) && res.status() >= 400) {
    badResponses.push({ status: res.status(), url });
  }
});

const paths = ["/", "/shop", "/collections", "/about"];

// Discover a product slug from API
let slug = "anji";
try {
  const prods = await (await fetch(`${API}/api/products?limit=5`)).json();
  if (prods[0]?.slug) slug = prods[0].slug;
} catch {
  /* ignore */
}
paths.push(`/product/${slug}`);

for (const path of paths) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(500);
}

// Hover a product card to trigger lifestyle image load
const card = page.locator("[data-testid^='product-card-']").first();
if (await card.count()) {
  await card.hover();
  await page.waitForTimeout(800);
}

await browser.close();

const report = {
  pages: paths,
  badResponses,
  consoleErrors: [...new Set(consoleErrors)],
};

console.log(JSON.stringify(report, null, 2));

if (badResponses.length) {
  console.error("FAILED: image/media 404s detected");
  process.exit(1);
}
if (consoleErrors.length) {
  console.error("FAILED: console errors detected");
  process.exit(1);
}
console.log("All media checks passed.");
