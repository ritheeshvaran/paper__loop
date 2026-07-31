import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ShoppingBag, User, Menu, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { fetchProducts } from "@/lib/products";
import { api } from "@/lib/api";
import { resolveMedia } from "@/lib/media";
import { asArray } from "@/lib/lists";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/shop", label: "Shop" },
  { to: "/about", label: "About" },
];

const ANNOUNCEMENT_H = 36;
const NAV_H = 68;

export const useNavOffset = () => {
  const loc = useLocation();
  const [hasAnnouncement, setHasAnnouncement] = useState(false);
  useEffect(() => {
    api.get("/settings").then((r) => setHasAnnouncement(!!r.data?.announcement)).catch(() => {});
  }, [loc.pathname]);
  return hasAnnouncement ? ANNOUNCEMENT_H + NAV_H : NAV_H;
};

export const Nav = ({ settings }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { user } = useAuth();
  const { cart, setDrawerOpen } = useCart();
  const loc = useLocation();

  const isHome = loc.pathname === "/";
  const hasAnnouncement = Boolean(settings?.announcement);
  const overHero = isHome && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); setSearchOpen(false); }, [loc.pathname]);

  const navClass = overHero
    ? "pl-nav-glass-light"
    : scrolled || !isHome
      ? "pl-nav-glass"
      : "pl-nav-transparent";

  const useTextLogo = !settings?.logo_url || /emergent|unsplash|pexels/i.test(settings.logo_url);

  return (
    <>
      <div
        className={`${isHome ? "fixed" : "sticky"} top-0 left-0 right-0 z-50`}
        data-testid="site-nav-wrap"
      >
        {hasAnnouncement && (
          <div
            data-testid="announcement-bar"
            className="bg-[color:var(--pl-black)] text-white text-center text-[11px] tracking-widest uppercase py-2 font-medium"
          >
            {settings.announcement}
          </div>
        )}

        <header
          data-testid="site-nav"
          className={`${navClass} text-white transition-[background,border-color,backdrop-filter] duration-500 ease-out`}
          style={{ height: NAV_H }}
        >
          <div className="pl-container flex items-center justify-between h-full">
            <Link to="/" data-testid="nav-logo" className="flex items-center shrink-0 group" data-cursor="Home">
              {useTextLogo ? (
                <span className="font-display text-[15px] tracking-[-0.02em] uppercase text-white group-hover:text-white/90 transition-colors">
                  Paper <span className="text-[color:var(--pl-orange)]">&</span> Loop
                </span>
              ) : (
                <img src={resolveMedia(settings.logo_url)} alt="Paper & Loop" className="h-7 w-auto" />
              )}
            </Link>

            <nav className="hidden lg:flex items-center gap-10 absolute left-1/2 -translate-x-1/2">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  data-testid={`nav-link-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={({ isActive }) =>
                    `relative text-[11px] tracking-[0.26em] uppercase font-medium transition-colors duration-300 ${isActive ? "text-white" : "text-white/75 hover:text-white"}`
                  }
                >
                  {({ isActive }) => (
                    <span className="relative inline-flex flex-col items-center py-1">
                      {l.label}
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute -bottom-0.5 h-px bg-[color:var(--pl-orange)]"
                        initial={false}
                        animate={{ width: isActive ? 20 : 0, opacity: isActive ? 1 : 0 }}
                        transition={{ type: "spring", damping: 24, stiffness: 340 }}
                      />
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-0.5">
              <button data-testid="nav-search-btn" aria-label="Search" onClick={() => setSearchOpen(true)} className="p-2.5 text-white/85 hover:text-[color:var(--pl-orange)] transition-colors duration-300" data-cursor="Search">
                <Search className="w-[18px] h-[18px]" strokeWidth={1.75} />
              </button>
              <Link to={user ? "/account" : "/login"} data-testid="nav-account-btn" aria-label="Account" className="p-2.5 text-white/85 hover:text-[color:var(--pl-orange)] transition-colors duration-300" data-cursor={user ? "Account" : "Sign in"}>
                <User className="w-[18px] h-[18px]" strokeWidth={1.75} />
              </Link>
              <button
                data-testid="nav-cart-btn"
                aria-label="Cart"
                onClick={() => setDrawerOpen(true)}
                className="relative p-2.5 text-white/85 hover:text-[color:var(--pl-orange)] transition-colors duration-300"
                data-cursor="Bag"
              >
                <ShoppingBag className="w-[18px] h-[18px]" strokeWidth={1.75} />
                {cart.items?.length > 0 && (
                  <motion.span
                    key={cart.items.reduce((a, i) => a + i.quantity, 0)}
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12, stiffness: 400 }}
                    data-testid="cart-count"
                    className="absolute top-1 right-1 bg-[color:var(--pl-orange)] text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center"
                  >
                    {cart.items.reduce((a, i) => a + i.quantity, 0)}
                  </motion.span>
                )}
              </button>
              <button data-testid="nav-mobile-toggle" aria-label="Menu" onClick={() => setMobileOpen(true)} className="p-2.5 lg:hidden text-white/85 hover:text-white">
                <Menu className="w-[18px] h-[18px]" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </header>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-[color:var(--pl-black)]/95 backdrop-blur-xl text-white flex flex-col"
          >
            <div className="pl-container flex items-center justify-between h-[68px]">
              <span className="font-display uppercase tracking-tight text-sm">Paper &amp; Loop</span>
              <button onClick={() => setMobileOpen(false)} aria-label="Close" className="p-2"><X /></button>
            </div>
            <nav className="pl-container flex-1 flex flex-col gap-6 justify-center">
              {links.map((l, i) => (
                <motion.div key={l.to} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0, transition: { delay: 0.05 * i } }}>
                  <Link to={l.to} className="font-display text-5xl md:text-6xl uppercase tracking-tight hover:text-[color:var(--pl-orange)]">{l.label}</Link>
                </motion.div>
              ))}
              <div className="mt-6 flex gap-3">
                <Link to={user ? "/account" : "/login"} className="pl-btn pl-btn-primary">{user ? "Account" : "Sign in"}</Link>
                <Link to="/shop" className="pl-btn pl-btn-ghost-dark">Shop</Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
};

const SearchOverlay = ({ open, onClose }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (!q) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const data = await fetchProducts({ q, limit: 8 });
        setResults(asArray(data));
      } catch (e) { setResults([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] pl-glass-dark" onClick={onClose}>
          <motion.div
            initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
            className="pl-container pt-8 md:pt-16" onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-white/20 pb-4">
              <Search className="w-5 h-5 text-white/60" />
              <input
                data-testid="search-input"
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search posters, keychains…"
                className="flex-1 bg-transparent text-white placeholder-white/40 font-display text-2xl md:text-4xl focus:outline-none"
              />
              <button onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white p-2"><X /></button>
            </div>
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
              {results.map((p) => (
                <a key={p.id} href={`/product/${p.slug}`} className="group block" data-cursor="View">
                  <div className="aspect-[3/4] overflow-hidden bg-neutral-900">
                    <img src={resolveMedia(p.images?.[0])} alt={p.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  </div>
                  <div className="mt-2 text-white text-sm font-medium">{p.name}</div>
                  <div className="text-white/60 text-xs uppercase tracking-wider">{p.category_slug}</div>
                </a>
              ))}
              {q && results.length === 0 && (
                <div className="col-span-full text-white/60 text-center py-16 font-display uppercase tracking-widest">Nothing matched. Try another word.</div>
              )}
              {!q && (
                <div className="col-span-full text-white/40 text-sm uppercase tracking-widest">Popular · Posters · Keychains · Anime · Cars</div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export { ANNOUNCEMENT_H, NAV_H };
