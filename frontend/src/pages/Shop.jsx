import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { asArray } from "@/lib/lists";
import { fetchProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";
import { FadeUp } from "@/components/Reveal";

/* Hierarchical shop taxonomy.
 * Type filter mapped to product data:
 *   - Posters: category_slug in {anime, cars, sports, movies, music, gaming, motivational}
 *   - Keychains: category_slug === "keychains" (or product_type === "keychain")
 *   - T-Shirts: coming soon (nothing to show yet)
 */
const TAXONOMY = {
  all: { label: "All", themes: [] },
  posters: {
    label: "Posters",
    themes: [
      { slug: "anime", label: "Anime" },
      { slug: "cars", label: "Cars" },
      { slug: "sports", label: "Sports" },
      { slug: "movies", label: "Movies" },
      { slug: "music", label: "Music" },
      { slug: "fashion", label: "Fashion" },
      { slug: "cities", label: "Cities" },
      { slug: "gaming", label: "Gaming" },
      { slug: "motivational", label: "Motivational" },
    ],
  },
  keychains: {
    label: "Keychains",
    themes: [
      { slug: "anime", label: "Anime" },
      { slug: "cars", label: "Cars" },
    ],
  },
  tshirts: { label: "T-Shirts", comingSoon: true, themes: [] },
};

/* Best-effort heuristic to bucket a product by name/description when
 * category_slug alone doesn't tell us its theme. */
const themeFor = (p) => {
  const s = (p.name + " " + (p.description || "")).toLowerCase();
  if (s.includes("anime") || s.includes("sakura") || s.includes("chibi") || s.includes("kanji") || s.includes("tokyo") || s.includes("tanjiro") || s.includes("demon slayer") || s.includes("naruto")) return "anime";
  if (s.includes("gt-r") || s.includes("gtr") || s.includes("jdm") || s.includes("ferrari") || s.includes("formula") || s.includes("autobahn") || s.includes("grid position")) return "cars";
  if (s.includes("court") || s.includes("f1") || s.includes("basketball") || s.includes("sport") || s.includes("kohli") || s.includes("ronaldo") || s.includes("messi")) return "sports";
  if (s.includes("vogue") || s.includes("leopard") || s.includes("fashion") || s.includes("model")) return "fashion";
  if (s.includes("new york") || s.includes("tokyo city") || s.includes("skyline") || s.includes("cities")) return "cities";
  if (s.includes("spider") || s.includes("marvel") || s.includes("batman") || s.includes("movie")) return "movies";
  if (s.includes("headphone") || s.includes("music") || s.includes("808") || s.includes("cathedral") || s.includes("sabrina") || s.includes("carpenter")) return "music";
  return p.category_slug;
};

const typeFor = (p) => (p.category_slug === "keychains" || (p.name || "").toLowerCase().includes("keychain")) ? "keychains" : "posters";

const Shop = () => {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const type = params.get("type") || "all";
  const theme = params.get("theme") || "";
  const sort = params.get("sort") || "newest";

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchProducts({ limit: 200, sort }).then((list) => { setProducts(list); setLoading(false); }).catch(() => { setProducts([]); setLoading(false); });
  }, [sort]);

  const filtered = useMemo(() => {
    let list = products;
    if (type !== "all") list = list.filter((p) => typeFor(p) === type);
    if (theme) list = list.filter((p) => themeFor(p) === theme);
    return list;
  }, [products, type, theme]);

  const setFilter = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") next.delete(k);
      else next.set(k, v);
    });
    setParams(next);
  };

  const subChips = TAXONOMY[type]?.themes || [];

  return (
    <div className="pl-section-light">
      {/* Editorial banner */}
      <div className="relative bg-[color:var(--pl-black)] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: "radial-gradient(circle at 20% 30%, rgba(255,106,0,0.35), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,106,0,0.15), transparent 40%)",
        }} />
        <div className="pl-container relative z-10 py-24 md:py-32">
          <div className="text-[11px] tracking-[0.28em] uppercase text-[color:var(--pl-orange)] mb-6">The Shop</div>
          <h1 className="font-display uppercase text-editorial max-w-4xl">
            {TAXONOMY[type]?.label || "All"}
            {theme && (
              <span className="text-[color:var(--pl-orange)]"> · {TAXONOMY[type]?.themes?.find((t) => t.slug === theme)?.label}</span>
            )}
          </h1>
          <p className="mt-4 text-white/60 max-w-xl text-sm">{filtered.length} {filtered.length === 1 ? "piece" : "pieces"} · Curated, never crowded.</p>
        </div>
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-14 md:top-[68px] z-30 pl-glass-light border-b border-neutral-200">
        <div className="pl-container py-4">
          {/* Type row */}
          <div className="flex items-center gap-2 overflow-x-auto">
            <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <span className="text-[10px] uppercase tracking-widest text-neutral-500 shrink-0 mr-2">Category</span>
            {Object.entries(TAXONOMY).map(([k, v]) => {
              const isActive = type === k;
              const disabled = v.comingSoon;
              return (
                <button
                  key={k}
                  disabled={disabled}
                  onClick={() => setFilter({ type: k === "all" ? "" : k, theme: "" })}
                  data-testid={`shop-type-${k}`}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-[11px] uppercase tracking-widest border transition-all ${
                    disabled ? "border-neutral-200 text-neutral-400 cursor-not-allowed" :
                    isActive ? "bg-black text-white border-black" : "border-neutral-300 hover:border-black"
                  }`}
                >
                  {v.label}{disabled && " · Coming Soon"}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-neutral-500" />
              <select value={sort} onChange={(e) => setFilter({ sort: e.target.value })} data-testid="sort-select" className="bg-transparent text-xs uppercase tracking-widest focus:outline-none border-none">
                <option value="newest">Newest</option>
                <option value="price_asc">Price ↑</option>
                <option value="price_desc">Price ↓</option>
                <option value="popularity">Popularity</option>
              </select>
            </div>
          </div>

          {/* Sub-theme row */}
          <AnimatePresence initial={false}>
            {subChips.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 overflow-x-auto pt-3">
                  <span className="text-[10px] uppercase tracking-widest text-neutral-500 shrink-0 mr-1">Theme</span>
                  <button onClick={() => setFilter({ theme: "" })} data-testid="shop-theme-all" className={`shrink-0 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest border ${!theme ? "bg-[color:var(--pl-orange)] text-white border-[color:var(--pl-orange)]" : "border-neutral-300 hover:border-black"}`}>All</button>
                  {subChips.map((s) => (
                    <button key={s.slug} onClick={() => setFilter({ theme: s.slug })} data-testid={`shop-theme-${s.slug}`} className={`shrink-0 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest border ${theme === s.slug ? "bg-[color:var(--pl-orange)] text-white border-[color:var(--pl-orange)]" : "border-neutral-300 hover:border-black"}`}>{s.label}</button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Grid */}
      <div className="pl-container py-16 md:py-24">
        {type === "tshirts" ? (
          <FadeUp>
            <div className="py-24 text-center">
              <div className="text-[11px] uppercase tracking-widest text-[color:var(--pl-orange)] mb-4">Dropping Season 2026</div>
              <h2 className="font-display text-editorial uppercase">Printed <br /><span className="text-[color:var(--pl-orange)]">Tees.</span></h2>
              <p className="text-neutral-500 mt-6 max-w-md mx-auto">Oversized silhouettes, real prints, real fabric. Get notified when the first capsule drops.</p>
              <button onClick={() => nav("/coming-soon")} className="pl-btn pl-btn-dark mt-8">Get Notified →</button>
            </div>
          </FadeUp>
        ) : loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8">
            {Array(8).fill(0).map((_, i) => (
              <motion.div key={i} initial={{ opacity: 0.4 }} animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                <div className="aspect-[3/4] bg-neutral-200" />
                <div className="h-4 mt-3 bg-neutral-200 w-3/4" />
                <div className="h-3 mt-2 bg-neutral-200 w-1/4" />
              </motion.div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <FadeUp>
            <div className="py-24 text-center">
              <div className="font-display text-editorial uppercase text-neutral-300">Nothing here yet</div>
              <p className="text-neutral-500 mt-4">Try a different filter — the next drop is always around the corner.</p>
              <button onClick={() => setFilter({ type: "", theme: "" })} className="pl-btn pl-btn-dark mt-6">Show everything</button>
            </div>
          </FadeUp>
        ) : (
          <motion.div layout className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8">
            {filtered.map((p, i) => <ProductCard key={p.id} product={p} index={i % 8} />)}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Shop;
