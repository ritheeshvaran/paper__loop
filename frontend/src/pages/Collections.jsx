import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { asArray } from "@/lib/lists";
import { fetchProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";
import { FadeUp } from "@/components/Reveal";
import { motion } from "framer-motion";
import { ArrowUpDown } from "lucide-react";

const Collections = () => {
  const { slug } = useParams();
  const [products, setProducts] = useState([]);
  const [cats, setCats] = useState([]);
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/categories").then((r) => setCats(asArray(r.data))).catch(() => setCats([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (slug && slug !== "all") params.set("category", slug);
    params.set("sort", sort);
    params.set("limit", "60");
    fetchProducts({ category: slug && slug !== "all" ? slug : undefined, sort, limit: 60 })
      .then((list) => { setProducts(list); setLoading(false); })
      .catch(() => { setProducts([]); setLoading(false); });
  }, [slug, sort]);

  const active = cats.find((c) => c.slug === slug);

  return (
    <div className="pl-section-light">
      {/* Banner */}
      <div className="relative bg-[color:var(--pl-black)] text-white overflow-hidden">
        {active?.banner_image_url && (
          <img src={active.banner_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/90" />
        <div className="pl-container relative z-10 py-24 md:py-32">
          <div className="text-[11px] tracking-[0.25em] uppercase text-[color:var(--pl-orange)] mb-4">The Collection</div>
          <h1 className="font-display uppercase text-editorial">{active?.name || "All Drops"}</h1>
          <p className="mt-4 text-white/70 max-w-xl">{products.length} {products.length === 1 ? "piece" : "pieces"} available. Curated, never crowded.</p>
        </div>
      </div>

      {/* Chip strip */}
      <div className="sticky top-16 md:top-20 z-30 pl-glass-light border-b border-neutral-200">
        <div className="pl-container py-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <Link to="/collections" className={`shrink-0 px-4 py-1.5 rounded-full text-[11px] uppercase tracking-widest border ${!slug ? "bg-black text-white border-black" : "border-neutral-300 hover:border-black"}`}>All</Link>
          {cats.map((c) => (
            <Link
              key={c.slug}
              to={`/collections/${c.slug}`}
              data-testid={`category-chip-${c.slug}`}
              className={`shrink-0 px-4 py-1.5 rounded-full text-[11px] uppercase tracking-widest border transition-colors ${slug === c.slug ? "bg-[color:var(--pl-orange)] text-white border-[color:var(--pl-orange)]" : "border-neutral-300 hover:border-black"}`}
            >
              {c.name}
            </Link>
          ))}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-neutral-500" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              data-testid="sort-select"
              className="bg-transparent text-xs uppercase tracking-widest focus:outline-none border-none"
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price ↑</option>
              <option value="price_desc">Price ↓</option>
              <option value="popularity">Popularity</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="pl-container py-16 md:py-24">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array(8).fill(0).map((_, i) => (
              <motion.div key={i} initial={{ opacity: 0.4 }} animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                <div className="aspect-[3/4] bg-neutral-200" />
                <div className="h-4 mt-3 bg-neutral-200 w-3/4" />
                <div className="h-3 mt-2 bg-neutral-200 w-1/4" />
              </motion.div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <FadeUp>
            <div className="py-24 text-center">
              <div className="font-display text-editorial uppercase text-neutral-300">404 · No drops</div>
              <p className="text-neutral-500 mt-4">Nothing lives in this collection yet. Come back for the next drop.</p>
              <Link to="/collections" className="pl-btn pl-btn-dark mt-6">See all</Link>
            </div>
          </FadeUp>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default Collections;
