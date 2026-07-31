import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

/* ── Cinematic Hero ────────────────────────────────────────────────────── */
const Hero = ({ heroBg, navOffset = 104 }) => {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, 120]);
  const overlay = useTransform(scrollY, [0, 400], [0.32, 0.58]);
  const contentY = useTransform(scrollY, [0, 400], [0, -60]);
  const contentOpacity = useTransform(scrollY, [0, 400], [1, 0]);

  return (
    <section
      className="relative w-full text-white overflow-hidden -mt-0"
      style={{ height: "min(100svh, 100vh)", marginTop: 0 }}
    >
      {/* Background — collector room, full-bleed under fixed nav */}
      <motion.div style={{ y }} className="absolute inset-0">
        <img
          src={heroBg}
          alt="Paper &amp; Loop collector's room"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "center 45%" }}
        />
        {/* Subtle dark overlay for text legibility (28% baseline, deepens on scroll) */}
        <motion.div className="absolute inset-0 bg-black" style={{ opacity: overlay }} />
        {/* Left-side vignette so the headline reads on any background variant */}
        <div className="absolute inset-0" style={{
          background: "linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0) 70%)"
        }} />
        {/* Bottom-to-top vignette for scroll cue */}
        <div className="absolute inset-0" style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.65) 100%)"
        }} />
      </motion.div>

      {/* Content — left-aligned; right side stays empty so the room breathes */}
      <motion.div
        style={{ y: contentY, opacity: contentOpacity, paddingTop: navOffset }}
        className="relative z-10 h-full pl-container flex flex-col justify-center"
      >
        <div className="max-w-2xl lg:max-w-[54%]">
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="text-[10px] md:text-[11px] tracking-[0.32em] uppercase text-[color:var(--pl-orange)] mb-5 md:mb-6 flex items-center gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--pl-orange)] animate-pulse" />
            Paper &amp; Loop · The Collector's Store
          </motion.div>

          <h1
            data-testid="hero-title"
            className="font-display uppercase text-white"
            style={{
              fontWeight: 900,
              lineHeight: 0.88,
              letterSpacing: "-0.035em",
              fontSize: "clamp(2.75rem, 8vw, 7.5rem)",
            }}
          >
            {[
              { word: "Collect", orange: false },
              { word: "what you", orange: false },
              { word: "love.", orange: true },
            ].map(({ word, orange }, i) => (
              <span key={i} className="pl-mask block">
                <motion.span
                  initial={{ y: "108%" }} animate={{ y: "0%" }}
                  transition={{ duration: 1.05, delay: 0.35 + i * 0.13, ease: [0.16, 1, 0.3, 1] }}
                  style={{ display: "inline-block" }}
                  className={orange ? "text-[color:var(--pl-orange)]" : ""}
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.7 }}
            className="mt-6 md:mt-7 text-white/75 max-w-lg text-sm md:text-base lg:text-lg leading-relaxed"
          >
            Premium posters and acrylic keychains inspired by anime, sports, cars, music and pop culture.
            Curate your walls. Express your personality.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.35, duration: 0.6 }}
            className="mt-8 md:mt-10 flex flex-wrap gap-3"
          >
            <MagneticButton to="/shop?type=posters" primary testId="hero-shop-btn">
              Shop Posters <ArrowRight className="w-4 h-4" />
            </MagneticButton>
            <MagneticButton to="/shop?type=keychains" testId="hero-keychains-btn">
              Shop Keychains
            </MagneticButton>
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.7 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 hidden md:flex flex-col items-center gap-2 text-white/50"
      >
        <span className="text-[10px] tracking-[0.32em] uppercase">Scroll</span>
        <motion.div animate={{ y: [0, 12, 0] }} transition={{ repeat: Infinity, duration: 1.8 }} className="w-px h-8 bg-white/50" />
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
    setOffset({ x: dx * 0.22, y: dy * 0.22 });
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

/* ── Testimonials & newsletter (unchanged) ────────────────────────────── */
const Testimonials = ({ items }) => {
  const list = asArray(items);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!list.length) return;
    const t = setInterval(() => setI((v) => (v + 1) % list.length), 6500);
    return () => clearInterval(t);
  }, [list.length]);
  if (!list.length) return null;
  const t = list[i];
  return (
    <div className="max-w-3xl mx-auto text-center">
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.5 }}>
          <div className="flex justify-center gap-1 mb-4">{Array(t.rating || 5).fill(0).map((_, k) => <Star key={k} className="w-4 h-4 fill-[color:var(--pl-orange)] text-[color:var(--pl-orange)]" />)}</div>
          <p className="font-display text-2xl md:text-3xl leading-tight">"{t.quote}"</p>
          <div className="mt-6 text-[11px] uppercase tracking-widest text-white/60">— {t.name}{t.location ? ` · ${t.location}` : ""}</div>
        </motion.div>
      </AnimatePresence>
      <div className="mt-8 flex items-center justify-center gap-6">
        <button onClick={() => setI((v) => (v - 1 + list.length) % list.length)} className="p-2 border border-white/20 hover:border-[color:var(--pl-orange)] hover:text-[color:var(--pl-orange)]" aria-label="Previous"><ChevronLeft className="w-4 h-4" /></button>
        <div className="flex gap-1">
          {list.map((_, k) => <button key={k} onClick={() => setI(k)} className={`w-6 h-0.5 ${k === i ? "bg-[color:var(--pl-orange)]" : "bg-white/20"}`} aria-label={`Slide ${k + 1}`} />)}
        </div>
        <button onClick={() => setI((v) => (v + 1) % list.length)} className="p-2 border border-white/20 hover:border-[color:var(--pl-orange)] hover:text-[color:var(--pl-orange)]" aria-label="Next"><ChevronRight className="w-4 h-4" /></button>
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
      setDone(true); setEmail(""); toast.success("You're on the list.");
    } catch { toast.error("Try again in a moment"); }
  };
  return (
    <form onSubmit={submit} className="mt-10 max-w-md mx-auto flex border-b border-white/30 pb-3">
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" className="flex-1 bg-transparent text-white placeholder-white/40 focus:outline-none px-2" data-testid="newsletter-email" />
      <button data-testid="newsletter-submit" className="text-white uppercase tracking-widest text-xs font-bold hover:text-[color:var(--pl-orange)]">{done ? "Subscribed ✓" : "Subscribe →"}</button>
    </form>
  );
};

/* ── Home ─────────────────────────────────────────────────────────────── */
const Home = ({ settings }) => {
  const [featured, setFeatured] = useState([]);
  const [testimonials, setTestimonials] = useState([]);
  const [gallery, setGallery] = useState([]);
  const nav = useNavigate();
  const navOffset = settings?.announcement ? 104 : 68;

  useEffect(() => {
    fetchProducts({ limit: 20, sort: "newest" }).then(setFeatured).catch(() => setFeatured([]));
    api.get("/testimonials").then((r) => setTestimonials(asArray(r.data))).catch(() => setTestimonials([]));
    fetch("/gallery.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setGallery(asArray(data)))
      .catch(() =>
        api.get("/gallery").then((r) => setGallery(asArray(r.data))).catch(() => setGallery([])),
      );
  }, []);

  const heroBg = resolveMedia(settings?.hero_background_url || brandAsset("hero"));

  return (
    <div className="bg-[color:var(--pl-black)]">
      <Hero heroBg={heroBg} navOffset={navOffset} />

      {/* Marquee */}
      <div className="bg-[color:var(--pl-orange)] text-white overflow-hidden border-y border-white/5">
        <div className="pl-marquee-track py-4">
          {Array(2).fill(0).map((_, k) => (
            <div key={k} className="flex gap-12 shrink-0 px-6">
              {["Free shipping across India", "Museum-grade matte print", "Fade-resistant archival ink", "New drops weekly", "Real editorial", "Premium acrylic keychains"].map((t) => (
                <span key={t} className="font-display uppercase tracking-widest text-sm whitespace-nowrap">◆ {t}</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 1 — Featured Posters */}
      <section className="pl-section-light py-24 md:py-32">
        <div className="pl-container">
          <div className="flex items-end justify-between mb-12">
            <FadeUp>
              <div className="text-[11px] tracking-[0.28em] uppercase text-neutral-500 mb-4">01 · Featured Posters</div>
              <h2 className="font-display text-editorial uppercase">Editorial <br />pieces for <span className="text-[color:var(--pl-orange)]">your wall.</span></h2>
            </FadeUp>
            <Link to="/shop?type=posters" className="hidden md:inline-flex pl-btn pl-btn-ghost-light">All Posters <ArrowUpRight className="w-4 h-4" /></Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8">
            {asArray(featured).slice(0, 4).map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
          {asArray(featured).length === 0 && (
            <div className="py-16 text-center text-neutral-500 text-sm">Products load in the admin panel — upload posters via /admin/products to fill this grid.</div>
          )}
        </div>
      </section>

      {/* SECTION 2 — Why Paper & Loop */}
      <section className="pl-section-dark py-24 md:py-32">
        <div className="pl-container">
          <FadeUp>
            <div className="text-[11px] tracking-[0.28em] uppercase text-white/50 mb-4">02 · Why Paper &amp; Loop</div>
            <h2 className="font-display text-editorial uppercase text-white mb-14">Built like <br />an <span className="text-[color:var(--pl-orange)]">archive.</span></h2>
          </FadeUp>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
            {[
              { n: "01", t: "Premium Paper", d: "250gsm matte stock. Thick, tactile, gallery-grade." },
              { n: "02", t: "Museum Quality Print", d: "12-color giclée. Depth and detail that photos won't do justice to." },
              { n: "03", t: "Fade Resistant", d: "Archival pigment ink. Colors stay true for 100+ years." },
              { n: "04", t: "High Resolution", d: "Every file prepared at 300+ DPI. No pixel left behind." },
            ].map((f, i) => (
              <FadeUp key={f.n} delay={i * 0.08}>
                <div className="border-t border-white/20 pt-6">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-4">{f.n}</div>
                  <div className="font-display uppercase text-xl text-white mb-3">{f.t}</div>
                  <p className="text-sm text-white/60 leading-relaxed">{f.d}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3 — Featured Keychains (Coming Soon) */}
      <section className="pl-section-light py-24 md:py-32">
        <div className="pl-container">
          <FadeUp>
            <div className="text-[11px] tracking-[0.28em] uppercase text-neutral-500 mb-4">03 · Acrylic Keychains</div>
            <h2 className="font-display text-editorial uppercase mb-10">Pocket-flex <br /><span className="text-[color:var(--pl-orange)]">coming soon.</span></h2>
          </FadeUp>
          <div className="relative overflow-hidden bg-neutral-900 text-white">
            <div className="absolute inset-0 opacity-30" style={{
              background: "radial-gradient(circle at 20% 30%, rgba(255,106,0,0.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,106,0,0.2), transparent 45%)"
            }} />
            <div className="relative z-10 grid md:grid-cols-2 items-center gap-8 p-8 md:p-16">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[color:var(--pl-orange)] mb-3">Season 2026</div>
                <h3 className="font-display uppercase text-3xl md:text-5xl">Double-sided.<br />Steel loop.<br /><span className="text-[color:var(--pl-orange)]">Pocket flex.</span></h3>
                <p className="mt-5 text-white/60 max-w-md">Acrylic keychains built to the same standard as the posters. Drop alerts open now.</p>
                <button onClick={() => nav("/coming-soon")} className="pl-btn pl-btn-primary mt-8">Notify Me →</button>
              </div>
              <div className="hidden md:flex justify-center">
                <div className="font-display uppercase text-[color:var(--pl-orange)] text-[9rem] leading-none opacity-20 select-none">P&amp;L</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4 — Customer Gallery */}
      {asArray(gallery).length > 0 && (
        <section className="pl-section-gray py-24 md:py-32">
          <div className="pl-container">
            <FadeUp>
              <div className="text-[11px] tracking-[0.28em] uppercase text-neutral-500 mb-4">04 · Customer Gallery</div>
              <h2 className="font-display text-editorial uppercase mb-12">On real <br /><span className="text-[color:var(--pl-orange)]">walls.</span></h2>
            </FadeUp>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {asArray(gallery).slice(0, 12).map((g, i) => (
                <motion.a
                  key={g.id}
                  href={g.link_url || "#"}
                  target="_blank" rel="noreferrer"
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="group relative aspect-square overflow-hidden bg-neutral-200"
                  data-cursor="Open"
                >
                  <img src={resolveMedia(g.image_url)} alt={g.caption || ""} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                </motion.a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Testimonials */}
      {asArray(testimonials).length > 0 && (
        <section className="pl-section-dark py-24 md:py-32">
          <div className="pl-container text-white">
            <FadeUp>
              <div className="text-center text-[11px] tracking-[0.28em] uppercase text-white/50 mb-4">Word on the wall</div>
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
            <h2 className="font-display text-editorial uppercase text-white max-w-3xl mx-auto">First to <br />know, <span className="text-[color:var(--pl-orange)]">first to own.</span></h2>
            <NewsletterForm />
            <p className="mt-3 text-white/40 text-xs uppercase tracking-widest">No spam. Only drops.</p>
          </FadeUp>
        </div>
      </section>
    </div>
  );
};

export default Home;
