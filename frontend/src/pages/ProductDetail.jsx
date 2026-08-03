import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Heart, ShoppingBag, Minus, Plus, Truck, ShieldCheck, Package, ArrowLeft, Bell } from "lucide-react";
import { api } from "@/lib/api";
import { fetchProductBySlug, fetchProducts } from "@/lib/products";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { formatINR } from "@/lib/format";
import { resolveMedia } from "@/lib/media";
import { brandAsset, ROOM_TEMPLATES } from "@/lib/assets";
import { isPurchasable, normalizeProductStatus } from "@/lib/productStatus";
import { ProductCard } from "@/components/ProductCard";
import { FadeUp } from "@/components/Reveal";
import { toast } from "sonner";

const ProductDetail = () => {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const [showRoom, setShowRoom] = useState(false);
  const [roomIdx, setRoomIdx] = useState(0);
  const [restockEmail, setRestockEmail] = useState("");
  const { addToCart, toggleWishlist, isWishlisted } = useCart();
  const { user } = useAuth();

  useEffect(() => {
    setQty(1); setActiveImg(0); setRestockEmail(user?.email || "");
    fetchProductBySlug(slug).then((p) => {
      if (!p) { setProduct(null); return; }
      setProduct(p);
      fetchProducts({ category: p.category_slug, limit: 8 })
        .then((list) => setRelated(list.filter((x) => x.id !== p.id).slice(0, 4)))
        .catch(() => setRelated([]));
    }).catch(() => setProduct(null));
    window.scrollTo({ top: 0, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!product) return <div className="min-h-[60vh] flex items-center justify-center font-display uppercase tracking-widest">Loading…</div>;

  const images = [product.images?.[0], product.lifestyle_image, ...(product.images?.slice(1) || [])].filter(Boolean).map(resolveMedia);
  const status = normalizeProductStatus(product);
  const canBuy = isPurchasable(product);
  const soldOut = status === "SOLD_OUT";
  const comingSoon = status === "COMING_SOON";
  const stockEmpty = status === "ACTIVE" && (product.stock_quantity ?? 0) <= 0;
  const showNotify = soldOut || comingSoon || stockEmpty;
  const lowStock = canBuy && (product.stock_quantity ?? 0) < 5;
  const room = ROOM_TEMPLATES[roomIdx];

  return (
    <div className="pl-section-light">
      <div className="pl-container pt-8">
        <Link to={`/shop?type=posters&theme=${product.category_slug === "keychains" ? "" : product.category_slug}`} className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-neutral-500 hover:text-black">
          <ArrowLeft className="w-3 h-3" /> Back to shop
        </Link>
      </div>

      <div className="pl-container py-8 md:py-12 grid lg:grid-cols-2 gap-10 lg:gap-16">
        {/* Gallery */}
        <div>
          <motion.div
            key={activeImg + (showRoom ? "-room" : "")}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="relative aspect-square lg:aspect-[4/5] bg-neutral-100 overflow-hidden"
          >
            {!showRoom ? (
              <img src={images[activeImg]} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="relative w-full h-full">
                <img src={brandAsset(room.asset)} alt="Room preview" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute" style={{ ...room.zone, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.5)" }}>
                  <img src={resolveMedia(product.images?.[0])} alt="poster overlay" className="w-full h-full object-cover" style={{ filter: "brightness(0.95) contrast(1.05)" }} />
                </div>
              </div>
            )}
          </motion.div>

          <div className="mt-3 flex items-center gap-3">
            <div className="flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => { setActiveImg(i); setShowRoom(false); }}
                  className={`w-16 h-20 shrink-0 border-2 ${activeImg === i && !showRoom ? "border-black" : "border-transparent"} bg-neutral-100`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            <button
              data-testid="room-preview-toggle"
              onClick={() => setShowRoom((s) => !s)}
              className={`ml-auto pl-btn ${showRoom ? "pl-btn-primary" : "pl-btn-ghost-light"} !px-3 !py-2 !text-[10px]`}
            >
              {showRoom ? "Product View" : "Room Preview"}
            </button>
          </div>

          {showRoom && (
            <div className="mt-3 flex gap-2">
              {ROOM_TEMPLATES.map((r, i) => (
                <button key={r.name} onClick={() => setRoomIdx(i)} className={`px-3 py-1.5 text-[10px] uppercase tracking-widest border ${roomIdx === i ? "border-black bg-black text-white" : "border-neutral-300"}`}>{r.name}</button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="lg:sticky lg:top-32 self-start">
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">{product.category_slug}</div>
          <h1 className="font-display uppercase text-3xl md:text-5xl mt-3 leading-none">{product.name}</h1>

          <div className="mt-5 flex items-baseline gap-3 font-tabular">
            <span data-testid="pdp-price" className="font-display text-3xl font-bold">{formatINR(product.final_price)}</span>
            {product.has_discount && <><span className="text-neutral-400 line-through">{formatINR(product.price)}</span><span className="text-[color:var(--pl-orange)] text-sm font-bold uppercase tracking-widest">−{Math.round(product.discount_percent)}%</span></>}
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs">
            {soldOut ? (
              <span className="uppercase tracking-widest text-neutral-500 font-bold" data-testid="pdp-sold-out">Sold Out</span>
            ) : comingSoon ? (
              <span className="uppercase tracking-widest text-[color:var(--pl-orange)] font-bold" data-testid="pdp-coming-soon">Coming Soon</span>
            ) : stockEmpty ? (
              <span className="uppercase tracking-widest text-neutral-500 font-bold" data-testid="pdp-oos">OUT OF STOCK</span>
            ) : lowStock ? (
              <span className="uppercase tracking-widest text-amber-700 font-bold">● Only {product.stock_quantity} left</span>
            ) : (
              <span className="uppercase tracking-widest text-green-700 font-bold" data-testid="pdp-in-stock">● In Stock</span>
            )}
          </div>

          <p className="mt-6 text-neutral-700 leading-relaxed">{product.description}</p>

          {/* Specs */}
          <div className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
            {[
              ["Material", product.material],
              ["Size", product.size],
              ["Finish", product.finish],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-3 text-sm">
                <span className="uppercase tracking-widest text-[10px] text-neutral-500 mt-1">{k}</span>
                <span className="text-right max-w-xs">{v}</span>
              </div>
            ))}
          </div>

          {/* Qty + CTA */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {canBuy && (
              <>
                <div className="inline-flex items-center border border-black">
                  <button data-testid="pdp-qty-dec" onClick={() => setQty(Math.max(1, qty - 1))} className="p-3 hover:bg-neutral-100"><Minus className="w-4 h-4" /></button>
                  <span className="px-4 font-tabular font-bold">{qty}</span>
                  <button
                    data-testid="pdp-qty-inc"
                    onClick={() => setQty((q) => Math.min(product.stock_quantity || 1, q + 1))}
                    disabled={qty >= (product.stock_quantity || 0)}
                    className="p-3 hover:bg-neutral-100 disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <button
                  data-testid="pdp-add-to-cart"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    addToCart(product, qty, { x: r.left + 40, y: r.top + 20 });
                  }}
                  className="pl-btn pl-btn-primary flex-1 min-w-[200px]"
                >
                  <ShoppingBag className="w-4 h-4" /> Add to Bag · {formatINR(product.final_price * qty)}
                </button>
              </>
            )}
            {showNotify && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api.post("/restock-alert", { email: restockEmail, product_id: product.id });
                    toast.success(comingSoon ? "We'll notify you when it's available." : "We'll email you the moment it's back.");
                    setRestockEmail("");
                  } catch { toast.error("Couldn't save. Try again."); }
                }}
                className="flex-1 min-w-[200px] flex gap-2"
              >
                <input
                  type="email"
                  required
                  value={restockEmail}
                  onChange={(e) => setRestockEmail(e.target.value)}
                  placeholder={comingSoon ? "Notify me when available" : "Notify me when back"}
                  className="flex-1 border border-black px-3 py-3 focus:outline-none"
                  data-testid="restock-email"
                />
                <button data-testid="restock-submit" className="pl-btn pl-btn-dark"><Bell className="w-4 h-4" /> Notify Me</button>
              </form>
            )}
            <button
              data-testid="pdp-wishlist"
              onClick={() => toggleWishlist(product)}
              aria-label="Wishlist"
              className="pl-btn pl-btn-ghost-light !px-4"
            >
              <Heart className={`w-5 h-5 ${isWishlisted(product.id) ? "fill-[color:var(--pl-orange)] text-[color:var(--pl-orange)]" : ""}`} />
            </button>
          </div>

          {/* Trust row */}
          <div className="mt-8 grid grid-cols-3 gap-3 text-xs">
            {[{ i: <Truck className="w-4 h-4" />, t: "Free Delivery", s: "Across India, always" }, { i: <ShieldCheck className="w-4 h-4" />, t: "Secure UPI", s: "GPay-verified" }, { i: <Package className="w-4 h-4" />, t: "3–5 Day Dispatch", s: "Tracked shipping" }].map((f) => (
              <div key={f.t} className="border border-neutral-200 p-3">
                <div className="text-[color:var(--pl-orange)]">{f.i}</div>
                <div className="mt-1 font-bold uppercase tracking-widest text-[10px]">{f.t}</div>
                <div className="text-neutral-500 mt-0.5">{f.s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <div className="pl-container py-16">
          <FadeUp>
            <div className="text-[11px] tracking-[0.25em] uppercase text-neutral-500 mb-4">You may also like</div>
            <h2 className="font-display text-editorial uppercase mb-10">Same energy. <br /><span className="text-[color:var(--pl-orange)]">More drops.</span></h2>
          </FadeUp>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {related.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetail;
