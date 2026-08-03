/**
 * Delivery checkout flow — Woxsen campus + Outside Woxsen API tests.
 * Run: node _e2e_delivery_flow.mjs  (requires backend :8000)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "_e2e_artifacts");
fs.mkdirSync(outDir, { recursive: true });

const API = "http://127.0.0.1:8000/api";
const stamp = Date.now();
const CUSTOMER_EMAIL = `qa.delivery.${stamp}@example.com`;
const CUSTOMER_PW = "TestPass123!";

const results = [];

function ok(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log("PASS", name, detail);
}
function fail(name, detail) {
  results.push({ name, ok: false, detail: String(detail) });
  console.log("FAIL", name, detail);
}

async function api(method, urlPath, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const err = new Error(typeof data === "object" ? (data.detail || JSON.stringify(data)) : text);
    err.status = res.status;
    throw err;
  }
  return data;
}

let token;
let product;

try {
  const otpSend = await api("POST", "/auth/send-otp", { body: { email: CUSTOMER_EMAIL, purpose: "registration" } });
  const verified = await api("POST", "/auth/verify-otp", {
    body: { email: CUSTOMER_EMAIL, purpose: "registration", code: otpSend.dev_code },
  });
  const reg = await api("POST", "/auth/register", {
    body: {
      email: CUSTOMER_EMAIL,
      password: CUSTOMER_PW,
      name: "Delivery QA",
      phone: "9876501234",
      otp_token: verified.otp_token,
    },
  });
  token = reg.token;
  ok("register");
} catch (e) {
  fail("register", e.message);
  process.exit(1);
}

try {
  const products = await api("GET", "/products?limit=20");
  product = products.find((p) => (p.stock_quantity ?? 0) > 0) || products[0];
  if (!product) throw new Error("no products");
  ok("products", product.slug);
} catch (e) {
  fail("products", e.message);
  process.exit(1);
}

async function checkoutWith(body) {
  await api("POST", "/cart", { token, body: { product_id: product.id, quantity: 1 } });
  return api("POST", "/orders/checkout", { token, body });
}

// Woxsen validation
try {
  let blocked = false;
  try {
    await checkoutWith({
      delivery_type: "woxsen_university",
      customer_name: "Test",
      phone: "999",
      tower: "",
      room_number: "",
    });
  } catch (e) {
    blocked = e.status === 422;
  }
  if (!blocked) throw new Error("woxsen missing tower/room accepted");
  ok("woxsen-validation");
} catch (e) {
  fail("woxsen-validation", e.message);
}

// Outside validation
try {
  let blocked = false;
  try {
    await checkoutWith({
      delivery_type: "outside_woxsen",
      customer_name: "Test",
      phone: "999",
      address_line1: "",
      city: "Hyderabad",
      state: "TS",
      pincode: "500001",
    });
  } catch (e) {
    blocked = e.status === 422;
  }
  if (!blocked) throw new Error("outside missing address accepted");
  ok("outside-validation");
} catch (e) {
  fail("outside-validation", e.message);
}

// Woxsen order
let woxsenOrder;
try {
  woxsenOrder = await checkoutWith({
    delivery_type: "woxsen_university",
    customer_name: "Campus User",
    phone: "9876501234",
    tower: "Tower A",
    room_number: "204",
    delivery_instructions: "Near lift",
  });
  if (woxsenOrder.delivery_type !== "woxsen_university") throw new Error("delivery_type missing");
  if (woxsenOrder.tower !== "Tower A") throw new Error(`tower=${woxsenOrder.tower}`);
  if (woxsenOrder.room_number !== "204") throw new Error(`room=${woxsenOrder.room_number}`);
  ok("woxsen-checkout", woxsenOrder.order_number);
} catch (e) {
  fail("woxsen-checkout", e.message);
}

// Outside order (new cart — previous cleared)
try {
  const outsideOrder = await checkoutWith({
    delivery_type: "outside_woxsen",
    customer_name: "Home User",
    phone: "9123456789",
    address_line1: "42 MG Road",
    address_line2: "Flat 3B",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500032",
    country: "India",
  });
  if (outsideOrder.delivery_type !== "outside_woxsen") throw new Error("delivery_type missing");
  if (outsideOrder.address_line1 !== "42 MG Road") throw new Error("address not saved");
  if (outsideOrder.country !== "India") throw new Error("country not saved");
  ok("outside-checkout", outsideOrder.order_number);
} catch (e) {
  fail("outside-checkout", e.message);
}

const summary = { results, passed: results.every((r) => r.ok), woxsenOrder: woxsenOrder?.order_number };
fs.writeFileSync(path.join(outDir, "delivery-flow-summary.json"), JSON.stringify(summary, null, 2));

// Optional UI smoke (requires frontend :3000)
try {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await page.addInitScript(([k, tok]) => localStorage.setItem(k, tok), ["pl_token", token]);
  await page.goto("http://127.0.0.1:3000/checkout", { waitUntil: "networkidle", timeout: 60000 });
  await page.click('[data-testid="delivery-type-woxsen_university"]');
  await page.waitForSelector('[data-testid="checkout-tower"]');
  await page.click('[data-testid="delivery-type-outside_woxsen"]');
  await page.waitForSelector('[data-testid="checkout-address_line1"]');
  if (consoleErrors.length) throw new Error(consoleErrors.join("; "));
  ok("ui-checkout-toggle");
  await browser.close();
} catch (e) {
  fail("ui-checkout-toggle", e.message);
}

summary.passed = results.every((r) => r.ok);
fs.writeFileSync(path.join(outDir, "delivery-flow-summary.json"), JSON.stringify({ results, passed: summary.passed, woxsenOrder: woxsenOrder?.order_number }, null, 2));
console.log(JSON.stringify({ results, passed: summary.passed, woxsenOrder: woxsenOrder?.order_number }, null, 2));
process.exit(summary.passed ? 0 : 1);
