import { api } from "@/lib/api";
import { asArray } from "@/lib/lists";

let staticCatalog = null;

async function loadStaticCatalog() {
  if (staticCatalog) return staticCatalog;
  const res = await fetch(`${process.env.PUBLIC_URL || ""}/products.json`);
  if (!res.ok) return [];
  staticCatalog = asArray(await res.json());
  return staticCatalog;
}

function applyClientFilters(list, params = {}) {
  let out = [...list];
  if (params.category) out = out.filter((p) => p.category_slug === params.category);
  if (params.q != null && String(params.q).trim() !== "") {
    const q = String(params.q).toLowerCase();
    out = out.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        (p.category_slug || "").toLowerCase().includes(q),
    );
  }
  if (params.featured === true || params.featured === "true") out = out.filter((p) => p.is_featured);
  if (params.trending === true || params.trending === "true") out = out.filter((p) => p.is_trending);
  if (params.best_seller === true || params.best_seller === "true") out = out.filter((p) => p.is_best_seller);

  const sort = params.sort || "newest";
  if (sort === "price_asc") out.sort((a, b) => a.price - b.price);
  else if (sort === "price_desc") out.sort((a, b) => b.price - a.price);
  else if (sort === "popularity") out.sort((a, b) => (b.is_best_seller - a.is_best_seller) || (b.sort_order - a.sort_order));
  else out.sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0));

  const limit = params.limit ? Number(params.limit) : null;
  if (limit && limit > 0) out = out.slice(0, limit);
  return out;
}

/**
 * Fetch products — always try live API first (CRA proxy `/api` in dev, absolute URL in prod).
 * Fall back to static catalog only when the API is unreachable (static-only Vercel deploys).
 */
export async function fetchProducts(params = {}) {
  try {
    const { data } = await api.get("/products", { params });
    const list = asArray(data);
    if (list.length) return list;
  } catch {
    /* use static catalog */
  }
  const staticList = await loadStaticCatalog();
  return applyClientFilters(staticList, params);
}

/** Fetch one product by slug — API first, static fallback. */
export async function fetchProductBySlug(slug) {
  try {
    const { data } = await api.get(`/products/${slug}`);
    if (data?.slug) return data;
  } catch {
    /* use static catalog */
  }
  const staticList = await loadStaticCatalog();
  return staticList.find((p) => p.slug === slug) || null;
}
