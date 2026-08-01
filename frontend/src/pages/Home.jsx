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

/* ── Collection helpers (shop types only) ─────────────────────────────── */

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

const ROOM_SCENES = [
  {
    id: "bedroom",
    label: "Bedroom wall",
    note: "Quiet archive",
    // Absolute poster placements — gallery wall, not product grid
    frames: [
      { top: "8%", left: "6%", width: "28%", height: "52%", rotate: -1.2 },
      { top: "10%", left: "37%", width: "26%", height: "46%", rotate: 0.6 },
      { top: "8%", left: "66%", width: "28%", height: "50%", rotate: 1.1 },
      { top: "64%", left: "10%", width: "22%", height: "28%", rotate: -0.4 },
      { top: "60%", left: "36%", width: "28%", height: "32%", rotate: 0.8 },
      { top: "62%", left: "68%", width: "24%", height: "30%", rotate: -0.7 },
    ],
  },
  {
    id: "gaming",
    label: "Gaming setup",
    note: "Night desk",
    frames: [
      { top: "6%", left: "4%", width: "22%", height: "58%", rotate: -0.8 },
      { top: "10%", left: "28%", width: "20%", height: "42%", rotate: 0.4 },
      { top: "6%", left: "50%", width: "22%", height: "56%", rotate: -0.3 },
      { top: "8%", left: "74%", width: "22%", height: "48%", rotate: 1.0 },
      { top: "56%", left: "26%", width: "24%", height: "36%", rotate: 0.5 },
      { top: "58%", left: "54%", width: "22%", height: "34%", rotate: -0.6 },
      { top: "62%", left: "78%", width: "18%", height: "30%", rotate: 0.9 },
    ],
  },
];

const productText = (p) => `${p?.name || ""} ${p?.description || ""}`.toLowerCase();

/* ── Cinematic Hero ────────────────────────────────────────────────────── */
const Hero = ({ heroBg, navOffset = 68 }) => {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, 70]);
  const scale = useTransform(scrollY, [0, 600], [1.04, 1.1]);
  const overlay = useTransform(scrollY, [0, 400], [0.3, 0.48]);
  const contentY = useTransform(scrollY, [0, 400], [0, -36]);
  const contentOpacity = useTransform(scrollY, [0, 380], [1, 0]);

  return (
    <section
      className="relative w-full text-white overflow-hidden"
      style={{ height: "min(100svh, 100vh)" }}
    >
      <motion.div style={{ y, scale }} className="absolute inset-[-3%]">
        <img
          src={heroBg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "center 42%" }}
          fetchPriority="high"
        />
        {/* Subtle dark overlay only — readability without decorative gradients */}
        <motion.div className="absolute inset-0 bg-black" style={{ opacity: overlay }} />
      </motion.div>

      <motion.div
        style={{ y: contentY, opacity: contentOpacity, paddingTop: navOffset }}
        className="relative z-10 h-full pl-container flex flex-col justify-center items-start"
      >
        <div className="w-full max-w-[20rem] sm:max-w-md md:max-w-xl lg:max-w-[42%] xl:max-w-[38%] mr-auto text-left">
          <h1
            data-testid="hero-title"
            className="font-display uppercase text-white"
            style={{
              fontWeight: 900,
              lineHeight: 0.88,
              letterSpacing: "-0.035em",
              fontSize: "clamp(3rem, 8.6vw, 7.7rem)",
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
                  transition={{ duration: 1.05, delay: 0.2 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
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
            transition={{ delay: 0.95, duration: 0.65 }}
            className="mt-9 md:mt-11 text-white/75 max-w-md text-sm md:text-base lg:text-lg leading-relaxed"
          >
            Premium posters and acrylic keychains for collectors who curate their space with intent.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.55 }}
            className="pl-hero-cta mt-11 md:mt-14 flex flex-wrap gap-3"
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

/* ── Immersive collector rooms ────────────────────────────────────────── */
const CollectorWall = ({ scene, posters }) => {
  const frames = scene.frames.map((frame, i) => ({
    ...frame,
    poster: posters[i % posters.length],
  }));

  return (
    <div className="relative">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <div className="font-display uppercase tracking-tight text-lg md:text-xl text-white">{scene.label}</div>
        <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">{scene.note}</div>
      </div>

      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: "16 / 10",
          background:
            "radial-gradient(ellipse at 50% 0%, #2a2a2a 0%, #141414 45%, #0a0a0a 100%)",
          boxShadow: "inset 0 0 80px rgba(0,0,0,0.55)",
        }}
      >
        {/* Soft wall wash — not a decorative gradient overlay on content */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 28%, rgba(0,0,0,0.35) 100%)",
          }}
        />

        {/* Desk / floor ledge for room depth */}
        <div
          className="absolute inset-x-0 bottom-0 h-[14%] pointer-events-none"
          style={{
            background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 40%, #070707 100%)",
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}
        />

        {frames.map((f, i) => (
          <div
            key={`${scene.id}-${i}`}
            className="absolute"
            style={{
              top: f.top,
              left: f.left,
              width: f.width,
              height: f.height,
              transform: `rotate(${f.rotate}deg)`,
            }}
          >
            <div
              className="relative w-full h-full bg-[#1a1a1a]"
              style={{
                padding: "3.5%",
                boxShadow:
                  "0 18px 40px rgba(0,0,0,0.55), 0 2px 0 rgba(255,255,255,0.04) inset",
              }}
            >
              <img
                src={resolveMedia(f.poster)}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
                style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.35)" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const WallsWithIntent = ({ posters }) => {
  if (posters.length < 4) return null;

  // Prefer anime/movies for a collector-wall feel; cycle them for density
  const focus = posters.filter((p) => ["anime", "movies"].includes(p.category_slug) && p.images?.[0]);
  const rest = posters.filter((p) => !["anime", "movies", "keychains"].includes(p.category_slug) && p.images?.[0]);
  const pool = [...focus, ...rest];
  const urls = pool.map((p) => p.images[0]).filter(Boolean);
  if (urls.length < 4) return null;

  const pick = (offset, count) => Array.from({ length: count }, (_, i) => urls[(offset + i) % urls.length]);
  const roomA = pick(0, 6);
  const roomB = pick(2, 7);

  return (
    <section className="bg-[color:var(--pl-black)] py-24 md:py-32" data-testid="walls-with-intent">
      <div className="pl-container">
        <FadeUp>
          <div className="max-w-2xl mb-12 md:mb-16">
            <div className="text-[11px] tracking-[0.28em] uppercase text-white/40 mb-4">Room Inspiration</div>
            <h2 className="font-display text-editorial uppercase text-white">
              Walls with <span className="text-[color:var(--pl-orange)]">intent.</span>
            </h2>
            <p className="mt-5 text-white/50 text-sm md:text-base leading-relaxed max-w-md">
              Step into a collector&apos;s room — posters layered the way they live on real walls.
            </p>
          </div>
        </FadeUp>

        <div className="space-y-14 md:space-y-20">
          <FadeUp>
            <CollectorWall scene={ROOM_SCENES[0]} posters={roomA} />
          </FadeUp>
          <FadeUp delay={0.08}>
            <CollectorWall scene={ROOM_SCENES[1]} posters={roomB} />
          </FadeUp>
        </div>

        <FadeUp delay={0.1}>
          <div className="mt-12 md:mt-14 flex justify-start">
            <Link to="/shop?type=posters" className="pl-btn pl-btn-ghost-dark">
              Shop posters <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </FadeUp>
      </div>
    </section>
  );
};

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
  const navOffset = 68;

  useEffect(() => {
    fetchProducts({ limit: 48, sort: "newest" }).then(setProducts).catch(() => setProducts([]));
    api.get("/testimonials").then((r) => setTestimonials(asArray(r.data))).catch(() => setTestimonials([]));
  }, []);

  const list = asArray(products);

  const collections = useMemo(() => {
    const posters = list.filter((p) => p.category_slug !== "keychains" && p.images?.[0]);
    const keychains = list.filter((p) => p.category_slug === "keychains" && p.images?.[0]);
    return [
      {
        key: "posters",
        label: "Posters",
        href: "/shop?type=posters",
        image: posters[0]?.images?.[0] || list.find((p) => p.images?.[0])?.images?.[0],
        comingSoon: false,
      },
      {
        key: "keychains",
        label: "Keychains",
        href: "/shop?type=keychains",
        image: keychains[0]?.images?.[0] || brandAsset("comingSoonAccessories"),
        comingSoon: false,
      },
      {
        key: "tshirts",
        label: "T-Shirts",
        href: null,
        image: brandAsset("comingSoonTees"),
        comingSoon: true,
      },
    ].filter((c) => c.image);
  }, [list]);

  const newest = useMemo(() => {
    const marked = list.filter((p) => p.is_new);
    return (marked.length ? marked : list).slice(0, 4);
  }, [list]);

  const bestSellers = useMemo(() => {
    const marked = list.filter((p) => p.is_best_seller);
    return (marked.length ? marked : list.slice(0, 4)).slice(0, 4);
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

  const wallPosters = useMemo(
    () => list.filter((p) => p.category_slug !== "keychains" && p.images?.[0]),
    [list],
  );

  const heroBg = resolveMedia(settings?.hero_background_url || brandAsset("hero"));

  return (
    <div className="bg-[color:var(--pl-black)]">
      <Hero heroBg={heroBg} navOffset={navOffset} />

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

      {/* Shop by Collection — Posters · Keychains · T-Shirts */}
      {collections.length > 0 && (
        <section className="pl-section-light py-24 md:py-32" data-testid="shop-by-collection">
          <div className="pl-container">
            <SectionHead
              light
              kicker="01 · Shop by Collection"
              title="Shop by"
              accent="collection."
              to="/shop"
              linkLabel="Browse shop"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
              {collections.map((c, i) => {
                const inner = (
                  <>
                    <img
                      src={resolveMedia(c.image)}
                      alt={c.label}
                      loading="lazy"
                      className={`absolute inset-0 w-full h-full object-cover transition-transform duration-700 ${c.comingSoon ? "scale-100 opacity-80" : "group-hover:scale-105"}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    {c.comingSoon && (
                      <div className="absolute top-4 right-4 md:top-5 md:right-5 z-10">
                        <span className="inline-block text-[10px] uppercase tracking-[0.22em] font-bold bg-white/10 text-white border border-white/25 px-3 py-1.5 backdrop-blur-sm">
                          Coming Soon
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">
                      <div className="font-display uppercase text-white text-xl md:text-3xl tracking-tight">{c.label}</div>
                      {!c.comingSoon && (
                        <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-white/60">Explore</div>
                      )}
                    </div>
                  </>
                );

                return (
                  <FadeUp key={c.key} delay={i * 0.05}>
                    {c.comingSoon ? (
                      <div
                        className="relative block aspect-[4/5] overflow-hidden bg-neutral-200 cursor-not-allowed select-none"
                        aria-disabled="true"
                        data-testid="collection-tshirts-soon"
                      >
                        {inner}
                      </div>
                    ) : (
                      <Link
                        to={c.href}
                        className="group relative block aspect-[4/5] overflow-hidden bg-neutral-200"
                        data-cursor="Open"
                        data-testid={`collection-${c.key}`}
                      >
                        {inner}
                      </Link>
                    )}
                  </FadeUp>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* New Drop */}
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

      {/* Best Sellers */}
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

      {/* Browse by Universe */}
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

      {/* Why Paper & Loop */}
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

      {/* Walls with Intent — immersive collector rooms */}
      <WallsWithIntent posters={wallPosters} />

      {/* Ordering Process */}
      <section className="pl-section-gray py-24 md:py-32">
        <div className="pl-container">
          <FadeUp>
            <div className="text-[11px] tracking-[0.28em] uppercase text-neutral-500 mb-4">Ordering Process</div>
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

      {/* Testimonials */}
      {asArray(testimonials).length > 0 && (
        <section className="pl-section-dark py-24 md:py-32">
          <div className="pl-container text-white">
            <FadeUp>
              <div className="text-center text-[11px] tracking-[0.28em] uppercase text-white/45 mb-10">Word on the wall</div>
              <Testimonials items={testimonials} />
            </FadeUp>
          </div>
        </section>
      )}

      {/* Newsletter */}
      <section className="pl-section-dark py-24 md:py-32 border-t border-white/10">
        <div className="pl-container text-center">
          <FadeUp>
            <div className="text-[11px] tracking-[0.28em] uppercase text-[color:var(--pl-orange)] mb-4">Drop Alerts</div>
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
