/**
 * Full customer + admin purchase flow against local CRA + FastAPI.
 * Run: node _e2e_purchase_flow.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.E2E_BASE || "http://127.0.0.1:3000";
const ADMIN_EMAIL = "ritheeshvaran2007@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const email = `buyer.${randomUUID().slice(0, 8)}@gmail.com`;
const password = "BuyerPass123!";
const outDir = path.join(__dirname, "_e2e_artifacts");
fs.mkdirSync(outDir, { recursive: true });

const failures = [];
const networkFails = [];
const consoleErrors = [];
const results = {};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();

page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`console: ${m.text()}`);
});
page.on("response", (res) => {
  const u = res.url();
  if (!u.includes("/api/")) return;
  if (res.status() >= 400) networkFails.push({ url: u, status: res.status() });
});

async function shot(name) {
  const p = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function go(pathName) {
  await page.goto(BASE + pathName, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);
}

function assert(cond, msg) {
  if (!cond) {
    failures.push(msg);
    console.error("FAIL:", msg);
  } else {
    console.log("OK:", msg);
  }
}

try {
  // ── 1. Home ───────────────────────────────────────────────
  await go("/");
  await shot("01-home");
  assert(await page.locator('[data-testid="hero-title"]').count() > 0, "Home hero loads");

  // ── 2–3. Shop + products ──────────────────────────────────
  await go("/shop");
  await page.waitForTimeout(1500);
  const cards = page.locator('[data-testid^="product-card-"]');
  await cards.first().waitFor({ timeout: 15000 });
  const productCount = await cards.count();
  assert(productCount > 0, `Products load (${productCount})`);
  await shot("02-shop");

  // ── 6. Filters ────────────────────────────────────────────
  await page.click('[data-testid="shop-type-posters"]');
  await page.waitForTimeout(500);
  await page.click('[data-testid="shop-theme-anime"]').catch(() => {});
  await page.waitForTimeout(500);
  await shot("03-shop-filter");

  // ── 5. Search ─────────────────────────────────────────────
  await page.click('[data-testid="nav-search-btn"]');
  await page.fill('[data-testid="search-input"]', "spider");
  await page.waitForTimeout(1200);
  await shot("04-search");
  await page.keyboard.press("Escape").catch(() => {});
  await page.click('button[aria-label="Close"]').catch(() => {});

  // ── Register + OTP ────────────────────────────────────────
  await go("/register");
  await page.fill('[data-testid="register-email"]', email);
  let sendBody = null;
  page.once("response", async (res) => {
    if (res.url().includes("/auth/send-otp")) {
      try { sendBody = await res.json(); } catch {}
    }
  });
  await page.click('[data-testid="register-send-otp"]');
  await page.waitForTimeout(3000);
  assert(sendBody?.delivery === "sent" || sendBody?.dev_code, `OTP send delivery=${sendBody?.delivery}`);
  const otp = sendBody?.dev_code;
  assert(!!otp, `Got OTP code ${otp}`);
  for (let i = 0; i < 6; i++) await page.fill(`[data-testid="otp-input-${i}"]`, otp[i]);
  await page.waitForTimeout(2000);
  await page.fill('[data-testid="register-name"]', "QA Buyer");
  await page.fill('[data-testid="register-password"]', password);
  await page.fill('[data-testid="register-confirm"]', password);
  await page.fill('[data-testid="register-phone"]', "9876543210");
  await page.fill('[data-testid="register-address_line1"]', "12 Collector Street");
  await page.fill('[data-testid="register-city"]', "Chennai");
  await page.fill('[data-testid="register-state"]', "TN");
  await page.fill('[data-testid="register-pincode"]', "600001");
  await page.click('[data-testid="register-submit"]');
  await page.waitForTimeout(3000);
  assert(page.url().includes("/account"), `Registered → ${page.url()}`);
  results.email = email;
  await shot("05-registered");

  // ── Wishlist + Cart from shop ─────────────────────────────
  await go("/shop");
  await page.waitForTimeout(1200);
  const firstCard = page.locator('[data-testid^="product-card-"]').first();
  const slug = (await firstCard.getAttribute("data-testid")).replace("product-card-", "");
  results.productSlug = slug;

  // wishlist (must not race/clobber cart)
  await page.click(`[data-testid="wishlist-btn-${slug}"]`);
  await page.waitForTimeout(600);

  // add via PDP (reliable vs hover quick-add)
  await go(`/product/${slug}`);
  await page.waitForTimeout(800);
  await page.click('[data-testid="pdp-add-to-cart"]');
  await page.waitForTimeout(1500);
  await shot("06-cart-added");

  // open cart if not open
  if (!(await page.locator('[data-testid="cart-drawer"]').isVisible().catch(() => false))) {
    await page.click('[data-testid="nav-cart-btn"]');
    await page.waitForTimeout(500);
  }
  assert(await page.locator('[data-testid="cart-drawer"]').isVisible(), "Cart drawer open");
  await page.waitForSelector('[data-testid="cart-total"]', { timeout: 10000 });
  // qty update
  const inc = page.locator(`[data-testid="cart-qty-inc-${slug}"]`);
  if (await inc.count()) {
    await inc.click();
    await page.waitForTimeout(800);
  }
  const totalText = await page.locator('[data-testid="cart-total"]').innerText().catch(() => "");
  assert(!!totalText && !/₹\s*0$/.test(totalText.replace(/\s/g, "")), `Cart total shown: ${totalText}`);
  results.cartTotal = totalText;
  await shot("07-cart-qty");

  // ── Checkout ──────────────────────────────────────────────
  await page.click('[data-testid="cart-checkout-btn"]');
  await page.waitForURL("**/checkout**", { timeout: 15000 });
  await page.waitForTimeout(800);
  // ensure address fields filled
  await page.fill('[data-testid="checkout-address_line1"]', "12 Collector Street");
  await page.fill('[data-testid="checkout-city"]', "Chennai");
  await page.fill('[data-testid="checkout-state"]', "TN");
  await page.fill('[data-testid="checkout-pincode"]', "600001");
  await page.fill('[data-testid="checkout-phone"]', "9876543210");
  await shot("08-checkout");
  await page.click('[data-testid="checkout-proceed"]');
  await page.waitForURL("**/checkout/payment/**", { timeout: 20000 });
  await page.waitForTimeout(1000);

  // ── Payment QR ────────────────────────────────────────────
  const qr = page.locator('[data-testid="gpay-qr"]');
  await qr.waitFor({ timeout: 10000 });
  const qrSrc = await qr.getAttribute("src");
  assert(qrSrc && qrSrc.includes("upi-qr-ritheesh"), `QR src is canonical: ${qrSrc}`);
  const upiText = await page.locator('[data-testid="copy-upi-id"]').innerText();
  assert(upiText.includes("ritheeshvaran2007@okhdfcbank"), `UPI ID correct: ${upiText}`);
  await shot("09-payment-qr");

  // Create a tiny PNG for screenshot upload
  const pngPath = path.join(outDir, "fake-proof.png");
  // 1x1 PNG
  fs.writeFileSync(pngPath, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ));
  await page.setInputFiles('[data-testid="payment-screenshot-input"]', pngPath);
  await page.waitForTimeout(1500);

  const txn = `TXN${Date.now().toString().slice(-10)}`;
  await page.fill('[data-testid="txn-input"]', txn);
  await page.click('[data-testid="submit-payment"]');
  await page.waitForURL("**/checkout/confirmation/**", { timeout: 20000 });
  await page.waitForTimeout(800);
  const conf = await page.locator('[data-testid="confirmation-status"]').innerText();
  assert(/Verification Pending|awaiting admin/i.test(conf), `Confirmation status: ${conf}`);
  await shot("10-confirmation");
  results.txn = txn;

  // ── Customer order history ────────────────────────────────
  await page.click('[data-testid="view-order-btn"]');
  await page.waitForURL("**/account/orders/**", { timeout: 15000 });
  await page.waitForTimeout(1000);
  const orderStatus = await page.locator('[data-testid="order-status"]').innerText();
  const payStatus = await page.locator('[data-testid="payment-status"]').innerText();
  assert(/Payment Verification Pending/i.test(orderStatus) || /Payment Verification Pending/i.test(payStatus),
    `Customer sees pending verification: order=${orderStatus} pay=${payStatus}`);
  assert(!(/Approved/i.test(orderStatus) && !/Pending/i.test(payStatus)), "Not auto-approved after submit");
  const orderUrl = page.url();
  const orderId = orderUrl.split("/").pop();
  results.orderId = orderId;
  results.orderNumber = await page.locator('[data-testid="order-number"]').innerText();
  await shot("11-customer-order-pending");

  // ── Admin login + approve ─────────────────────────────────
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await go("/login");
  await page.fill('[data-testid="login-email"]', ADMIN_EMAIL);
  await page.fill('[data-testid="login-password"]', ADMIN_PASSWORD);
  await page.click('[data-testid="login-submit"]');
  await page.waitForTimeout(2500);

  // verify admin role via /admin
  await go("/admin/orders");
  await page.waitForTimeout(1500);
  if (page.url().includes("/login") || !(await page.locator('[data-testid="admin-sidebar"]').count())) {
    failures.push(`Admin login failed — check ADMIN_PASSWORD (url=${page.url()})`);
    await shot("12-admin-login-fail");
  } else {
    await shot("12-admin-orders");
    await go(`/admin/orders/${orderId}`);
    await page.waitForTimeout(1200);
    const adminPay = await page.locator('[data-testid="admin-payment-status"]').innerText().catch(() => "");
    assert(/Payment Verification Pending/i.test(adminPay), `Admin sees pending: ${adminPay}`);
    await shot("13-admin-order-detail");

    await page.click('[data-testid="admin-approve-payment"]');
    await page.waitForTimeout(1500);
    const adminPay2 = await page.locator('[data-testid="admin-payment-status"]').innerText();
    const adminOrd2 = await page.locator('[data-testid="admin-order-status"]').innerText();
    assert(/Payment Approved/i.test(adminPay2), `Admin payment approved: ${adminPay2}`);
    assert(/Order Confirmed/i.test(adminOrd2), `Admin order confirmed: ${adminOrd2}`);
    await shot("14-admin-approved");
  }

  // ── Customer sees approved ────────────────────────────────
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await go("/login");
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForTimeout(2000);
  await go(`/account/orders/${orderId}`);
  await page.waitForTimeout(1200);
  const finalOrder = await page.locator('[data-testid="order-status"]').innerText();
  const finalPay = await page.locator('[data-testid="payment-status"]').innerText();
  assert(/Order Confirmed/i.test(finalOrder), `Customer order confirmed: ${finalOrder}`);
  assert(/Payment Approved/i.test(finalPay), `Customer payment approved: ${finalPay}`);
  await shot("15-customer-approved");

  // ── Reject flow (second order) ────────────────────────────
  await go("/shop");
  await page.waitForTimeout(1000);
  const card2 = page.locator('[data-testid^="product-card-"]').nth(1);
  const slug2 = (await card2.getAttribute("data-testid")).replace("product-card-", "");
  await go(`/product/${slug2}`);
  await page.waitForTimeout(800);
  await page.click('[data-testid="pdp-add-to-cart"]');
  await page.waitForTimeout(1500);
  if (!(await page.locator('[data-testid="cart-drawer"]').isVisible().catch(() => false))) {
    await page.click('[data-testid="nav-cart-btn"]');
  }
  await page.waitForSelector('[data-testid="cart-checkout-btn"]', { timeout: 10000 });
  await page.click('[data-testid="cart-checkout-btn"]');
  await page.waitForURL("**/checkout**", { timeout: 15000 });
  await page.fill('[data-testid="checkout-address_line1"]', "12 Collector Street");
  await page.fill('[data-testid="checkout-city"]', "Chennai");
  await page.fill('[data-testid="checkout-state"]', "TN");
  await page.fill('[data-testid="checkout-pincode"]', "600001");
  await page.fill('[data-testid="checkout-phone"]', "9876543210");
  await page.click('[data-testid="checkout-proceed"]');
  await page.waitForURL("**/checkout/payment/**", { timeout: 20000 });
  const orderId2 = page.url().split("/").pop();
  await page.fill('[data-testid="txn-input"]', `REJ${Date.now().toString().slice(-10)}`);
  await page.click('[data-testid="submit-payment"]');
  await page.waitForURL("**/checkout/confirmation/**", { timeout: 20000 });

  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await go("/login");
  await page.fill('[data-testid="login-email"]', ADMIN_EMAIL);
  await page.fill('[data-testid="login-password"]', ADMIN_PASSWORD);
  await page.click('[data-testid="login-submit"]');
  await page.waitForTimeout(2000);
  await go(`/admin/orders/${orderId2}`);
  await page.waitForTimeout(1000);
  if (await page.locator('[data-testid="admin-reject-payment"]').count()) {
    await page.click('[data-testid="admin-reject-payment"]');
    await page.waitForTimeout(1200);
    await shot("16-admin-rejected");
  } else {
    failures.push("Admin reject button missing for second order");
  }

  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await go("/login");
  await page.fill('[data-testid="login-email"]', email);
  await page.fill('[data-testid="login-password"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForTimeout(2000);
  await go(`/account/orders/${orderId2}`);
  await page.waitForTimeout(1000);
  const rejPay = await page.locator('[data-testid="payment-status"]').innerText();
  assert(/Payment Rejected/i.test(rejPay), `Customer sees rejected: ${rejPay}`);
  assert(await page.locator('[data-testid="retry-payment-btn"]').count() > 0, "Retry Payment button shown");
  await shot("17-customer-rejected-retry");

  // ── Mobile viewport smoke ─────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await go("/");
  await shot("18-mobile-home");
  await go("/shop");
  await shot("19-mobile-shop");

} catch (e) {
  failures.push(`Unhandled: ${e}`);
  console.error(e);
  await shot("99-crash").catch(() => {});
} finally {
  const summary = {
    results,
    failures,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 40),
    networkFails: networkFails.slice(0, 40),
    toLowerCase: consoleErrors.filter((e) => /toLowerCase/i.test(e)),
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n======== SUMMARY ========");
  console.log(JSON.stringify(summary, null, 2));
  console.log("Artifacts:", outDir);
  await browser.close();
  process.exit(failures.length ? 1 : 0);
}
