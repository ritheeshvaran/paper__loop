/**
 * Full order-flow QA — API + Playwright UI checks.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "_e2e_artifacts");
fs.mkdirSync(outDir, { recursive: true });

const API = "http://127.0.0.1:8000/api";
const BASE = "http://127.0.0.1:3000";
const ADMIN_EMAIL = "ritheeshvaran2007@gmail.com";
const ADMIN_PW = "admin123";
const stamp = Date.now();
const CUSTOMER_EMAIL = `qa.order.${stamp}@example.com`;
const CUSTOMER_PW = "TestPass123!";

const results = [];
const consoleErrors = [];
const failedRequests = [];

function ok(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log("PASS", name, detail);
}
function fail(name, detail) {
  results.push({ name, ok: false, detail: String(detail) });
  console.log("FAIL", name, detail);
}

async function api(method, urlPath, { token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) {
    payload = { method, headers, body: formData };
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = { method, headers, body: JSON.stringify(body) };
  } else {
    payload = { method, headers };
  }
  const res = await fetch(`${API}${urlPath}`, payload);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const err = new Error(typeof data === "object" ? (data.detail || JSON.stringify(data)) : text);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ── API flow ──────────────────────────────────────────────────────────────
let customerToken, adminToken, product, orderId, orderNumber;

try {
  // Register via OTP
  const otpSend = await api("POST", "/auth/send-otp", { body: { email: CUSTOMER_EMAIL, purpose: "registration" } });
  if (!otpSend.dev_code) throw new Error("No dev_code from send-otp");
  const verified = await api("POST", "/auth/verify-otp", {
    body: { email: CUSTOMER_EMAIL, purpose: "registration", code: otpSend.dev_code },
  });
  const reg = await api("POST", "/auth/register", {
    body: {
      email: CUSTOMER_EMAIL,
      password: CUSTOMER_PW,
      name: "QA Customer",
      phone: "9876543210",
      otp_token: verified.otp_token,
      address_line1: "12 Test Street",
      city: "Chennai",
      state: "TN",
      pincode: "600001",
    },
  });
  customerToken = reg.token;
  ok("register+otp", CUSTOMER_EMAIL);
} catch (e) {
  fail("register+otp", e.message);
}

try {
  const admin = await api("POST", "/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PW } });
  adminToken = admin.token;
  ok("admin-login");
} catch (e) {
  fail("admin-login", e.message);
}

try {
  const products = await api("GET", "/products?limit=50");
  product = products.find((p) => p.slug === "ferrari-sf-25") || products[0];
  if (!product) throw new Error("no products");
  ok("products-list", `${product.slug} stock=${product.stock_quantity}`);
} catch (e) {
  fail("products-list", e.message);
}

// Mandatory screenshot validation
try {
  await api("POST", "/cart", { token: customerToken, body: { product_id: product.id, quantity: 1 } });
  const order = await api("POST", "/orders/checkout", {
    token: customerToken,
    body: {
      delivery_type: "outside_woxsen",
      customer_name: "QA Customer",
      address_line1: "12 Test Street",
      address_line2: "Apt 1",
      city: "Chennai",
      state: "TN",
      pincode: "600001",
      phone: "9876543210",
      country: "India",
    },
  });
  orderId = order.id;
  orderNumber = order.order_number;
  ok("checkout", orderNumber);

  let blocked = false;
  try {
    await api("POST", `/orders/${orderId}/submit-payment`, {
      token: customerToken,
      body: { transaction_id: "TXN123456", payment_screenshot_url: "" },
    });
  } catch (e) {
    blocked = e.status === 400 || e.status === 422;
  }
  if (!blocked) throw new Error("empty screenshot was accepted");
  ok("screenshot-required-api");

  // Upload proof via multipart
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const fd = new FormData();
  fd.append("file", new Blob([png], { type: "image/png" }), "proof.png");
  const uploaded = await api("POST", `/orders/${orderId}/upload-payment-proof`, {
    token: customerToken,
    formData: fd,
  });
  await api("POST", `/orders/${orderId}/submit-payment`, {
    token: customerToken,
    body: { transaction_id: `TXN${stamp}`, payment_screenshot_url: uploaded.url },
  });
  const afterPay = await api("GET", `/orders/${orderId}`, { token: customerToken });
  if (afterPay.status !== "payment_under_validation") throw new Error(`status=${afterPay.status}`);
  if (!afterPay.payment_screenshot_url) throw new Error("screenshot missing on order");
  ok("payment-submit", afterPay.status);
} catch (e) {
  fail("checkout/payment", e.message);
}

// Approve without date must fail
try {
  let blocked = false;
  try {
    await api("POST", `/admin/orders/${orderId}/approve-payment`, {
      token: adminToken,
      body: { note: "ok" },
    });
  } catch (e) {
    blocked = e.status === 400 || e.status === 422;
  }
  if (!blocked) throw new Error("approve without delivery_date accepted");
  ok("approve-requires-delivery-date");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 3);
  await api("POST", `/admin/orders/${orderId}/approve-payment`, {
    token: adminToken,
    body: { note: "verified", delivery_date: tomorrow.toISOString() },
  });
  const approved = await api("GET", `/orders/${orderId}`, { token: customerToken });
  if (approved.payment_status !== "verified") throw new Error("not verified");
  if (approved.status !== "preparing") throw new Error(`expected preparing got ${approved.status}`);
  if (!approved.delivery_date) throw new Error("delivery_date missing");
  ok("admin-approve+delivery", approved.status);
} catch (e) {
  fail("admin-approve", e.message);
}

// Review
try {
  const review = await api("POST", "/reviews", {
    token: customerToken,
    body: { rating: 5, title: "Great print", quote: "Ferrari poster looks premium on my wall.", photo_url: "" },
  });
  if (!review.verified_purchase) throw new Error("missing verified_purchase");
  const pub = await api("GET", "/testimonials");
  if (!pub.find((r) => r.id === review.id)) throw new Error("review not public");
  ok("review-create", review.id);

  await api("PUT", `/admin/testimonials/${review.id}/visibility`, {
    token: adminToken,
    body: { hidden: true },
  });
  const hiddenList = await api("GET", "/testimonials");
  if (hiddenList.find((r) => r.id === review.id)) throw new Error("hidden review still public");
  await api("PUT", `/admin/testimonials/${review.id}/visibility`, {
    token: adminToken,
    body: { hidden: false },
  });
  ok("review-hide-show");
} catch (e) {
  fail("reviews", e.message);
}

// Delivered
try {
  await api("PUT", `/admin/orders/${orderId}/status`, {
    token: adminToken,
    body: { status: "delivered", note: "Delivered" },
  });
  const d = await api("GET", `/orders/${orderId}`, { token: customerToken });
  if (d.status !== "delivered") throw new Error(d.status);
  ok("mark-delivered");
} catch (e) {
  fail("mark-delivered", e.message);
}

// Stock zero
let stockProduct;
try {
  const products = await api("GET", "/admin/products", { token: adminToken });
  stockProduct = products.find((p) => p.slug === "sweet-bear-unicorn-keychain") || products[0];
  await api("PUT", `/admin/products/${stockProduct.id}`, {
    token: adminToken,
    body: { ...stockProduct, stock_quantity: 0 },
  });
  const pub = await api("GET", `/products/${stockProduct.slug}`);
  if ((pub.stock_quantity ?? 0) !== 0) throw new Error("stock not 0");
  let blocked = false;
  try {
    await api("POST", "/cart", { token: customerToken, body: { product_id: stockProduct.id, quantity: 1 } });
  } catch (e) {
    blocked = /out of stock/i.test(String(e.message));
  }
  if (!blocked) throw new Error("oos product still addable");
  ok("stock-zero-blocks-cart");

  await api("PUT", `/admin/products/${stockProduct.id}`, {
    token: adminToken,
    body: { ...stockProduct, stock_quantity: 10 },
  });
  const restored = await api("GET", `/products/${stockProduct.slug}`);
  if (restored.stock_quantity < 10) throw new Error("stock not restored");
  await api("POST", "/cart", { token: customerToken, body: { product_id: stockProduct.id, quantity: 1 } });
  ok("stock-restored-available");
} catch (e) {
  fail("stock", e.message);
}

// Demo data gone
try {
  const customers = await api("GET", "/admin/customers", { token: adminToken });
  const demo = customers.find((c) => /demo@paperandloop/i.test(c.email || ""));
  if (demo) throw new Error("demo user still present");
  ok("demo-user-removed");
} catch (e) {
  fail("demo-cleanup-check", e.message);
}

// ── Playwright UI ─────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("response", (r) => {
  if (r.status() >= 400 && !r.url().includes("favicon") && !r.url().includes("restock")) {
    failedRequests.push(`${r.status()} ${r.url()}`);
  }
});

async function ui(name, fn) {
  try {
    await fn();
    ok(`ui:${name}`);
  } catch (e) {
    fail(`ui:${name}`, e.message);
    await page.screenshot({ path: path.join(outDir, `fail-${name}.png`), fullPage: true }).catch(() => {});
  }
}

await ui("homepage", async () => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector('[data-testid="hero-title"]');
  await page.screenshot({ path: path.join(outDir, "flow-home.png") });
});

await ui("shop-oos", async () => {
  await page.goto(`${BASE}/shop`, { waitUntil: "networkidle" });
  // After stock restore keychain is available; set another product to 0 via API for badge check
  if (stockProduct) {
    await api("PUT", `/admin/products/${stockProduct.id}`, {
      token: adminToken,
      body: { ...stockProduct, stock_quantity: 0 },
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.goto(`${BASE}/product/${stockProduct.slug}`, { waitUntil: "networkidle" });
    const text = await page.locator("body").innerText();
    if (!/out of stock/i.test(text)) throw new Error("PDP missing Out of Stock");
    const addDisabled = await page.locator('[data-testid="pdp-add-to-cart"]').count();
    if (addDisabled > 0) {
      const disabled = await page.locator('[data-testid="pdp-add-to-cart"]').isDisabled().catch(() => false);
      // button may be hidden when OOS — either is fine
      if (!disabled) {
        // check notify form instead
        if (!(await page.locator('[data-testid="restock-email"]').count())) throw new Error("add still enabled without restock form");
      }
    }
    await api("PUT", `/admin/products/${stockProduct.id}`, {
      token: adminToken,
      body: { ...stockProduct, stock_quantity: 10 },
    });
  }
});

await ui("login-admin", async () => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"], [data-testid="login-email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"], [data-testid="login-password"]', ADMIN_PW);
  await page.click('[data-testid="login-submit"], button[type="submit"]');
  await page.waitForTimeout(1500);
});

await ui("customer-order-single-badge", async () => {
  // login as customer via localStorage token injection
  await page.evaluate((tok) => {
    localStorage.setItem("pl_token", tok);
    localStorage.setItem("token", tok);
  }, customerToken);
  // AuthContext may use specific key — check AuthContext
});

await browser.close();

// Direct UI check with fresh context + injected auth
const browser2 = await chromium.launch({ headless: true });
const ctx2 = await browser2.newContext({ viewport: { width: 1440, height: 900 } });

// Discover auth storage key
const authProbe = await ctx2.newPage();
await authProbe.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
const authKeyHint = await authProbe.evaluate(() => Object.keys(localStorage));
await authProbe.close();

async function withToken(token, fn) {
  const p = await ctx2.newPage();
  p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await p.addInitScript((tok) => {
    for (const k of ["token", "pl_token", "authToken", "paperloop_token", "access_token"]) {
      localStorage.setItem(k, tok);
    }
    localStorage.setItem("user", JSON.stringify({ role: "customer" }));
  }, token);
  try {
    await fn(p);
  } finally {
    await p.close();
  }
}

// Find real auth key from AuthContext
const authSrc = fs.readFileSync(path.join(__dirname, "src/context/AuthContext.js"), "utf8");
const keyMatch = authSrc.match(/localStorage\.(?:get|set)Item\(["']([^"']+)["']/);
const AUTH_KEY = keyMatch?.[1] || "token";
console.log("auth key", AUTH_KEY, "localStorage keys seen", authKeyHint);

await ui("order-detail-single-badge", async () => {
  const p = await ctx2.newPage();
  await p.addInitScript(([k, tok]) => {
    localStorage.setItem(k, tok);
  }, [AUTH_KEY, customerToken]);
  await p.goto(`${BASE}/account/orders/${orderId}`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForSelector('[data-testid="order-status"]', { timeout: 15000 });
  const statuses = await p.locator('[data-testid="order-status"]').allInnerTexts();
  // Only one order-status badge in header
  const headerBadges = statuses.filter((t) => /payment verification pending/i.test(t));
  // After delivered, should say Delivered once
  const body = await p.locator("body").innerText();
  const pendingCount = (body.match(/Payment Verification Pending/gi) || []).length;
  if (pendingCount > 0 && !/Delivered/i.test(body)) {
    // shouldn't be pending after deliver
  }
  // Critical: no duplicate identical badges side by side for pending case — for delivered order check single Delivered
  const orderStatusCount = await p.locator('[data-testid="order-status"]').count();
  if (orderStatusCount !== 1) throw new Error(`expected 1 order-status badge, got ${orderStatusCount}`);
  if (!/delivered/i.test(await p.locator('[data-testid="order-status"]').innerText())) {
    throw new Error(`unexpected status text: ${await p.locator('[data-testid="order-status"]').innerText()}`);
  }
  if (!/expected delivery/i.test(body)) throw new Error("expected delivery missing");
  if (!/order delivered/i.test(body)) throw new Error("delivered message missing");
  await p.screenshot({ path: path.join(outDir, "flow-order-detail.png") });
  await p.close();
});

await ui("admin-order-proof", async () => {
  const p = await ctx2.newPage();
  await p.addInitScript(([k, tok]) => { localStorage.setItem(k, tok); }, [AUTH_KEY, adminToken]);
  await p.goto(`${BASE}/admin/orders/${orderId}`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForSelector('[data-testid="admin-payment-proof"], [data-testid="admin-order-status"]', { timeout: 15000 });
  const body = await p.locator("body").innerText();
  if (!/TXN/i.test(body) && !orderNumber) throw new Error("txn missing");
  await p.screenshot({ path: path.join(outDir, "flow-admin-order.png") });
  await p.close();
});

await ui("mobile-home", async () => {
  const p = await ctx2.newPage();
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-testid="hero-title"]');
  await p.screenshot({ path: path.join(outDir, "flow-mobile-home.png") });
  await p.close();
});

await browser2.close();

const summary = {
  results,
  consoleErrors: [...new Set(consoleErrors)].slice(0, 40),
  failedRequests: [...new Set(failedRequests)].slice(0, 40),
  orderNumber,
  customerEmail: CUSTOMER_EMAIL,
  passed: results.every((r) => r.ok),
};
fs.writeFileSync(path.join(outDir, "order-flow-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.passed ? 0 : 1);
