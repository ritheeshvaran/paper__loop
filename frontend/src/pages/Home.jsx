import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowUpRight, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { resolveMedia } from "@/lib/media";
import { brandAsset } from "@/lib/assets";
import { asArray } from "@/lib/lists";
import { fetchProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";
import { FadeUp } from "@/components/Reveal";
import { toast } from "sonner";

/* ── Collection & universe helpers (from live inventory only) ─────────── */
const COLLECTION_DEFS = [
  { key: "anime", label: "Anime Posters", href: "/shop?type=posters&theme=anime", match: (p) => p.category_slug === "anime" },
  { key: "keychains", label: "Keychains", href: "/shop?type=keychains", match: (p) => p.category_slug === "keychains" },
  { key: "movies", label: "Movies", href: "/shop?type=posters&theme=movies", match: (p) => p.category_slug === "movies" },
  { key: "cars", label: "Cars", href: "/shop?type=posters&theme=cars", match: (p) => p.category_slug === "cars" },
  { key: "limited", label: "Limited Editions", href: "/shop", match: (p) => !!p.is_limited },
  { key: "sports", label: "Sports", href: "/shop?type=posters&theme=sports", match: (p) => p.category_slug === "sports" },
  { key: "music", label: "Music", href: "/shop?type=posters&theme=music", match: (p) => p.category_slug === "music" },
  { key: "cities", label: "Cities", href: "/shop?type=posters&theme=cities", match: (p) => p.category_slug === "cities" },
  { key: "fashion", label: "Fashion", href: "/shop?type=posters&theme=fashion", match: (p) => p.category_slug === "fashion" },
];

const UNIVERSE_DEFS = [
  { label: "Spider-Man", href: "/shop?type=posters&theme=movies", keywords: ["spider-man", "spider man", "iron spider"] },
  { label: "Demon Slayer", href: "/shop?type=posters&theme=anime", keywords: ["tanjiro", "demon slayer"] },
  { label: "Formula 1", href: "/shop?type=posters&theme=cars", keywords: ["ferrari", "sf-25", "formula"] },
  { label: "Cricket", href: "/shop?type=posters&theme=sports", keywords: ["kohli", "cricket"] },
  { label: "Football", href: "/shop?type=posters&theme=sports", keywords: ["ronaldo", "cr7"] },
  { label: "Music", href: "/shop?type=posters&theme=music", keywords: ["sabrina", "music", "headphones", "short n"] },
];

const ORDER_STEPS = [
  "Browse",
  "Add to Cart",
  "Checkout",
  "Pay via QR",
  "Enter Transaction ID",
  "Payment Verification",
  "Order Confirmed",
  "Delivered",
];

const WHY_POINTS = [
  { t: "Premium quality", d: "Thick matte stock and archival pigment ink — built to last on your wall." },
  { t: "Collector packaging", d: "Every order ships like a drop: protected, intentional, ready to unbox." },
  { t: "High quality printing", d: "Sharp detail and deep blacks that cheap posters never get right." },
  { t: "Secure delivery", d: "Careful packing across India so prints arrive flat and ready to hang." },
  { t: "Limited collections", d: "Select pieces stay scarce. When a drop is gone, it stays gone." },
  { t: "Fast support", d: "Real humans on WhatsApp and email when you need a hand." },
];

const productText = (p) => `${p?.name || ""} ${p?.description || ""}`.toLowerCase();

/* ── Cinematic Hero ────────────────────────────────────────────────────── */
const Hero = ({ heroBg, logoSrc, navOffset = 104 }) => {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, 80]);
  const scale = useTransform(scrollY, [0, 600], [1.06, 1.14]);
  const overlay = useTransform(scrollY, [0, 400], [0.28, 0.55]);
  const contentY = useTransform(scrollY, [0, 400], [0, -40]);
  const contentOpacity = useTransform(scrollY, [0, 380], [1, 0]);

  return (
    <section
      className="relative w-full text-white overflow-hidden"
      style={{ height: "min(100svh, 100vh)" }}
    >
      <motion.div style={{ y, scale }} className="absolute inset-[-4%]">
        <img
          src={heroBg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "center 48%" }}
          fetchPriority="high"
        />
        <motion.div className="absolute inset-0 bg-black" style={{ opacity: overlay }} />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(105deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.35) 42%, rgba(0,0,0,0.12) 70%, rgba(0,0,0,0.45) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.7) 100%)",
          }}
        />
      </motion.div>

      <motion.div
        style={{ y: contentY, opacity: contentOpacity, paddingTop: navOffset }}
        className="relative z-10 h-full pl-container flex flex-col justify-center"
      >
        <div className="max-w-2xl lg:max-w-[56%]">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mb-6 md:mb-8"
          >
            {logoSrc ? (
              <motion.img
                src={logoSrc}
                alt="Paper & Loop"
                className="h-16 md:h-20 lg:h-24 w-auto max-w-[min(100%,280px)] object-contain drop-shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : (
              <div className="font-display uppercase tracking-tight text-2xl md:text-3xl">
                Paper <span className="text-[color:var(--pl-orange)]">&</span> Loop
              </div>
            )}
          </motion.div>

          <h1
            data-testid="hero-title"
            className="font-display uppercase text-white"
            style={{
              fontWeight: 900,
              lineHeight: 0.9,
              letterSpacing: "-0.035em",
              fontSize: "clamp(2.5rem, 7.2vw, 6.4rem)",
            }}
          >
            {[
              { word: "Collect", orange: false },
              { word: "what you", orange: false },
              { word: "love.", orange: true },
            ].map(({ word, orange }, i) => (
              <span key={i} className="pl-mask block">
                <motion.span
                  initial={{ y: "108%" }}
                  animate={{ y: "0%" }}
                  transition={{ duration: 1.05, delay: 0.28 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                  style={{ display: "inline-block" }}
                  className={orange ? "text-[color:var(--pl-orange)]" : ""}
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.05, duration: 0.65 }}
            className="mt-6 md:mt-7 text-white/75 max-w-lg text-sm md:text-base lg:text-[1.05rem] leading-relaxed"
          >
            Premium posters and acrylic keychains for collectors who curate their space with intent.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.25, duration: 0.55 }}
            className="mt-8 md:mt-10 flex flex-wrap gap-3"
          >
            <MagneticButton to="/shop" primary testId="hero-shop-btn">
              Shop Collection <ArrowRight className="w-4 h-4" />
            </MagneticButton>
            <MagneticButton to="/shop?type=keychains" testId="hero-keychains-btn">
              Explore Keychains
            </MagneticButton>
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 hidden md:flex flex-col items-center gap-2 text-white/45"
      >
        <span className="text-[10px] tracking-[0.32em] uppercase">Scroll</span>
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="w-px h-8 bg-white/45"
        />
      </motion.div>
    </section>
  );
};

/* ── Magnetic button ──────────────────────────────────────────────────── */
const MagneticButton = ({ to, primary, testId, children }) => {
  const ref = React.useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const onMove = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    setOffset({ x: dx * 0.18, y: dy * 0.18 });
  };
  const onLeave = () => setOffset({ x: 0, y: 0 });
  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      animate={{ x: offset.x, y: offset.y }}
      transition={{ type: "spring", damping: 18, stiffness: 260 }}
    >
      <Link
        to={to}
        data-testid={testId}
        data-cursor={primary ? "Shop" : "Browse"}
        className={primary ? "pl-btn pl-btn-primary" : "pl-btn pl-btn-ghost-dark"}
      >
        {children}
      </Link>
    </motion.div>
  );
};

/* ── Section chrome ───────────────────────────────────────────────────── */
const SectionHead = ({ kicker, title, accent, to, linkLabel, light = false }) => (
  <div className="flex items-end justify-between gap-6 mb-12 md:mb-14">
    <FadeUp>
      <div className={`text-[11px] tracking-[0.28em] uppercase mb-4 ${light ? "text-neutral-500" : "text-white/45"}`}>
        {kicker}
      </div>
      <h2 className={`font-display text-editorial uppercase ${light ? "" : "text-white"}`}>
        {title}{accent ? <> <span className="text-[color:var(--pl-orange)]">{accent}</span></> : null}
      </h2>
    </FadeUp>
    {to && (
      <Link
        to={to}
        className={`hidden md:inline-flex shrink-0 ${light ? "pl-btn pl-btn-ghost-light" : "pl-btn pl-btn-ghost-dark"}`}
      >
        {linkLabel || "View all"} <ArrowUpRight className="w-4 h-4" />
      </Link>
    )}
  </div>
);

/* ── Testimonials & newsletter ────────────────────────────────────────── */
const Testimonials = ({ items }) => {
  const list = asArray(items);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!list.length) return undefined;
    const t = setInterval(() => setI((v) => (v + 1) % list.length), 6500);
    return () => clearInterval(t);
  }, [list.length]);
  if (!list.length) return null;
  const t = list[i];
  return (
    <div className="max-w-3xl mx-auto text-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex justify-center gap-1 mb-4">
            {Array(t.rating || 5).fill(0).map((_, k) => (
              <Star key={k} className="w-4 h-4 fill-[color:var(--pl-orange)] text-[color:var(--pl-orange)]" />
            ))}
          </div>
          <p className="font-display text-2xl md:text-3xl leading-tight">"{t.quote}"</p>
          <div className="mt-6 text-[11px] uppercase tracking-widest text-white/60">
            — {t.name}{t.location ? ` · ${t.location}` : ""}
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="mt-8 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => setI((v) => (v - 1 + list.length) % list.length)}
          className="p-2 border border-white/20 hover:border-[color:var(--pl-orange)] hover:text-[color:var(--pl-orange)] transition-colors"
          aria-label="Previous"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex gap-1">
          {list.map((_, k) => (
            <button
              key={k}
              type="button"
              onClick={() => setI(k)}
              className={`w-6 h-0.5 transition-colors ${k === i ? "bg-[color:var(--pl-orange)]" : "bg-white/20"}`}
              aria-label={`Slide ${k + 1}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setI((v) => (v + 1) % list.length)}
          className="p-2 border border-white/20 hover:border-[color:var(--pl-orange)] hover:text-[color:var(--pl-orange)] transition-colors"
          aria-label="Next"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const NewsletterForm = () => {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/newsletter/subscribe", { email, source: "home_footer" });
      setDone(true);
      setEmail("");
      toast.success("You're on the list.");
    } catch {
      toast.error("Try again in a moment");
    }
  };
  return (
    <form onSubmit={submit} className="mt-10 max-w-md mx-auto flex border-b border-white/30 pb-3">
      <input
        required
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        className="flex-1 bg-transparent text-white placeholder-white/40 focus:outline-none px-2"
        data-testid="newsletter-email"
      />
      <button
        data-testid="newsletter-submit"
        type="submit"
        className="text-white uppercase tracking-widest text-xs font-bold hover:text-[color:var(--pl-orange)] transition-colors"
      >
        {done ? "Subscribed ✓" : "Subscribe →"}
      </button>
    </form>
  );
};

/* ── Home ─────────────────────────────────────────────────────────────── */
const Home = ({ settings }) => {
  const [products, setProducts] = useState([]);
  const [testimonials, setTestimonials] = useState([]);
  const navOffset = settings?.announcement ? 104 : 68;

  useEffect(() => {
    fetchProducts({ limit: 48, sort: "newest" }).then(setProducts).catch(() => setProducts([]));
    api.get("/testimonials").then((r) => setTestimonials(asArray(r.data))).catch(() => setTestimonials([]));
  }, []);

  const list = asArray(products);

  const collections = useMemo(() => {
    const built = COLLECTION_DEFS.map((def) => {
      const matches = list.filter(def.match);
      if (!matches.length) return null;
      const cover = matches.find((p) => p.images?.[0]) || matches[0];
      return { ...def, cover, count: matches.length };
    }).filter(Boolean);
    return built.slice(0, 6);
  }, [list]);

  const newest = useMemo(() => {
    const marked = list.filter((p) => p.is_new);
    return (marked.length ? marked : list).slice(0, 4);
  }, [list]);

  const bestSellers = useMemo(() => {
    const marked = list.filter((p) => p.is_best_seller);
    return (marked.length ? marked : list.slice(0, 4)).slice(0, 4);
  }, [list]);

  const collectorPicks = useMemo(() => {
    const marked = list.filter((p) => p.is_featured);
    return (marked.length ? marked : list).slice(0, 4);
  }, [list]);

  const universes = useMemo(() => (
    UNIVERSE_DEFS.map((u) => {
      const matches = list.filter((p) => {
        const text = productText(p);
        return u.keywords.some((k) => text.includes(k));
      });
      if (!matches.length) return null;
      return { ...u, cover: matches[0], count: matches.length };
    }).filter(Boolean)
  ), [list]);

  const collage = useMemo(() => list.filter((p) => p.images?.[0]).slice(0, 6), [list]);

  const heroBg = resolveMedia(settings?.hero_background_url || brandAsset("hero"));
  const logoSrc = resolveMedia(
    settings?.logo_url && !/emergent|unsplash|pexels/i.test(settings.logo_url)
      ? settings.logo_url
      : brandAsset("logo"),
  );

  return (
    <div className="bg-[color:var(--pl-black)]">
      <Hero heroBg={heroBg} logoSrc={logoSrc} navOffset={navOffset} />

      {/* Marquee */}
      <div className="bg-[color:var(--pl-orange)] text-white overflow-hidden border-y border-white/5">
        <div className="pl-marquee-track py-4">
          {Array(2).fill(0).map((_, k) => (
            <div key={k} className="flex gap-12 shrink-0 px-6">
              {["Free shipping across India", "Museum-grade matte print", "Fade-resistant archival ink", "New drops weekly", "Collector packaging", "Premium acrylic keychains"].map((t) => (
                <span key={`${k}-${t}`} className="font-display uppercase tracking-widest text-sm whitespace-nowrap">◆ {t}</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 02 — Featured Collections */}
      {collections.length > 0 && (
        <section className="pl-section-light py-24 md:py-32">
          <div className="pl-container">
            <SectionHead
              light
              kicker="01 · Featured Collections"
              title="Curated"
              accent="drops."
              to="/shop"
              linkLabel="Browse shop"
            />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
              {collections.map((c, i) => (
                <FadeUp key={c.key} delay={i * 0.05}>
                  <Link
                    to={c.href}
                    className="group relative block aspect-[4/5] overflow-hidden bg-neutral-200"
                    data-cursor="Open"
                  >
                    <img
                      src={resolveMedia(c.cover.images?.[0])}
                      alt={c.label}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4 md:p-6">
                      <div className="font-display uppercase text-white text-lg md:text-2xl tracking-tight">{c.label}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/65">
                        {c.count} piece{c.count === 1 ? "" : "s"}
                      </div>
                    </div>
                  </Link>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 03 — New Drop */}
      {newest.length > 0 && (
        <section className="pl-section-dark py-24 md:py-32">
          <div className="pl-container">
            <SectionHead
              kicker="02 · New Drop"
              title="Just"
              accent="arrived."
              to="/shop?sort=newest"
              linkLabel="See newest"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-7">
              {newest.map((p, i) => <ProductCard key={p.id} product={p} index={i} dark />)}
            </div>
          </div>
        </section>
      )}

      {/* 04 — Best Sellers */}
      {bestSellers.length > 0 && (
        <section className="pl-section-light py-24 md:py-32">
          <div className="pl-container">
            <SectionHead
              light
              kicker="03 · Best Sellers"
              title="Collector"
              accent="favorites."
              to="/shop"
              linkLabel="Shop all"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-7">
              {bestSellers.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          </div>
        </section>
      )}

      {/* 05 — Browse by Universe */}
      {universes.length > 0 && (
        <section className="pl-section-gray py-24 md:py-32">
          <div className="pl-container">
            <SectionHead
              light
              kicker="04 · Browse by Universe"
              title="Find your"
              accent="world."
            />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
              {universes.map((u, i) => (
                <FadeUp key={u.label} delay={i * 0.04}>
                  <Link
                    to={u.href}
                    className="group relative block aspect-[3/4] overflow-hidden bg-neutral-300"
                    data-cursor="Browse"
                  >
                    <img
                      src={resolveMedia(u.cover.images?.[0])}
                      alt={u.label}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-black/35 group-hover:bg-black/50 transition-colors duration-500" />
                    <div className="absolute inset-x-0 bottom-0 p-3 md:p-4">
                      <div className="font-display uppercase text-white text-sm md:text-base tracking-tight">{u.label}</div>
                    </div>
                  </Link>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 06 — Why Paper & Loop */}
      <section className="pl-section-dark py-24 md:py-32">
        <div className="pl-container">
          <FadeUp>
            <div className="text-[11px] tracking-[0.28em] uppercase text-white/45 mb-4">05 · Why Paper &amp; Loop</div>
            <h2 className="font-display text-editorial uppercase text-white mb-14">
              Built for <span className="text-[color:var(--pl-orange)]">collectors.</span>
            </h2>
          </FadeUp>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12">
            {WHY_POINTS.map((f, i) => (
              <FadeUp key={f.t} delay={i * 0.06}>
                <div className="border-t border-white/15 pt-6">
                  <div className="text-[10px] uppercase tracking-widest text-white/35 mb-4">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="font-display uppercase text-xl text-white mb-3">{f.t}</div>
                  <p className="text-sm text-white/55 leading-relaxed">{f.d}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* 07 — Room Inspiration (product collage) */}
      {collage.length >= 3 && (
        <section className="pl-section-light py-24 md:py-32">
          <div className="pl-container">
            <SectionHead
              light
              kicker="06 · Room Inspiration"
              title="Walls with"
              accent="intent."
              to="/shop?type=posters"
              linkLabel="Shop posters"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 auto-rows-[140px] md:auto-rows-[200px]">
              {collage.map((p, i) => {
                const span =
                  i === 0 ? "md:col-span-2 md:row-span-2" :
                  i === 3 ? "md:col-span-2" : "";
                return (
                  <FadeUp key={p.id} delay={i * 0.05} className={span}>
                    <Link
                      to={`/product/${p.slug}`}
                      className="group relative block h-full min-h-[140px] overflow-hidden bg-neutral-200"
                      data-cursor="View"
                    >
                      <img
                        src={resolveMedia(p.images?.[0])}
                        alt={p.name}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors duration-500" />
                      <div className="absolute inset-x-0 bottom-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                        <div className="font-display uppercase text-white text-sm tracking-tight">{p.name}</div>
                      </div>
                    </Link>
                  </FadeUp>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 08 — Collector Picks */}
      {collectorPicks.length > 0 && (
        <section className="pl-section-dark py-24 md:py-32">
          <div className="pl-container">
            <SectionHead
              kicker="07 · Collector Picks"
              title="Editorial"
              accent="selection."
              to="/shop"
              linkLabel="Explore"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-7">
              {collectorPicks.map((p, i) => <ProductCard key={p.id} product={p} index={i} dark />)}
            </div>
          </div>
        </section>
      )}

      {/* 09 — Ordering Process */}
      <section className="pl-section-gray py-24 md:py-32">
        <div className="pl-container">
          <FadeUp>
            <div className="text-[11px] tracking-[0.28em] uppercase text-neutral-500 mb-4">08 · Ordering Process</div>
            <h2 className="font-display text-editorial uppercase mb-14">
              From browse to <span className="text-[color:var(--pl-orange)]">doorstep.</span>
            </h2>
          </FadeUp>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {ORDER_STEPS.map((step, i) => (
              <FadeUp key={step} delay={i * 0.04}>
                <div className="border-t border-black/15 pt-5">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-400 mb-3">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="font-display uppercase text-lg md:text-xl tracking-tight">{step}</div>
                  {i < ORDER_STEPS.length - 1 && (
                    <div className="mt-3 text-[color:var(--pl-orange)] text-sm tracking-[0.3em]">↓</div>
                  )}
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* 10 — Testimonials */}
      {asArray(testimonials).length > 0 && (
        <section className="pl-section-dark py-24 md:py-32">
          <div className="pl-container text-white">
            <FadeUp>
              <div className="text-center text-[11px] tracking-[0.28em] uppercase text-white/45 mb-10">09 · Word on the wall</div>
              <Testimonials items={testimonials} />
            </FadeUp>
          </div>
        </section>
      )}

      {/* 11 — Newsletter */}
      <section className="pl-section-dark py-24 md:py-32 border-t border-white/10">
        <div className="pl-container text-center">
          <FadeUp>
            <div className="text-[11px] tracking-[0.28em] uppercase text-[color:var(--pl-orange)] mb-4">10 · Drop Alerts</div>
            <h2 className="font-display text-editorial uppercase text-white max-w-3xl mx-auto">
              First to know, <span className="text-[color:var(--pl-orange)]">first to own.</span>
            </h2>
            <NewsletterForm />
            <p className="mt-3 text-white/40 text-xs uppercase tracking-widest">No spam. Only drops.</p>
          </FadeUp>
        </div>
      </section>
    </div>
  );
};

export default Home;
