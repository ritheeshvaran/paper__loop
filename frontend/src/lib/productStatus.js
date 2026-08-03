export const PRODUCT_STATUSES = ["ACTIVE", "SOLD_OUT", "COMING_SOON"];

export function normalizeProductStatus(product) {
  const raw = String(product?.status || "ACTIVE").trim().toUpperCase().replace(/\s+/g, "_");
  return PRODUCT_STATUSES.includes(raw) ? raw : "ACTIVE";
}

export function statusLabel(status) {
  switch (normalizeProductStatus({ status })) {
    case "SOLD_OUT":
      return "Sold Out";
    case "COMING_SOON":
      return "Coming Soon";
    default:
      return "Active";
  }
}

/** Can be added to cart / purchased */
export function isPurchasable(product) {
  return normalizeProductStatus(product) === "ACTIVE" && (product?.stock_quantity ?? 0) > 0;
}

export function parseStockInput(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
