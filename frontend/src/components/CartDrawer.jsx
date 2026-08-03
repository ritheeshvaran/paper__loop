import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Trash2, Plus, Minus } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { formatINR } from "@/lib/format";
import { MediaImg } from "@/components/MediaImg";
import { resolveMedia } from "@/lib/media";

export const CartDrawer = () => {
  const { cart, drawerOpen, setDrawerOpen, updateQty, removeItem, flyFrom, setFlyFrom } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [target, setTarget] = useState(null);

  useEffect(() => {
    if (flyFrom) {
      const iconEl = document.querySelector('[data-testid="nav-cart-btn"]');
      if (iconEl) {
        const r = iconEl.getBoundingClientRect();
        setTarget({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }
      const t = setTimeout(() => setFlyFrom(null), 600);
      return () => clearTimeout(t);
    }
  }, [flyFrom, setFlyFrom]);

  const goCheckout = () => {
    setDrawerOpen(false);
    if (!user) { nav("/login?next=/checkout"); return; }
    nav("/checkout");
  };

  return (
    <>
      {/* Fly-to-cart */}
      <AnimatePresence>
        {flyFrom && target && (
          <motion.img
            key={flyFrom.key}
            src={flyFrom.img}
            alt=""
            initial={{ x: flyFrom.x - 30, y: flyFrom.y - 30, opacity: 0.9, scale: 1 }}
            animate={{ x: target.x - 20, y: target.y - 20, opacity: 0, scale: 0.3 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-0 top-0 z-[80] w-16 h-16 object-cover pointer-events-none rounded-sm shadow-2xl"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[75] pl-glass-dark"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              data-testid="cart-drawer"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 260 }}
              className="fixed right-0 top-0 bottom-0 z-[80] w-full sm:w-[420px] bg-white flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-200">
                <h3 className="font-display uppercase tracking-tight text-xl">Your Bag ({cart.items?.length || 0})</h3>
                <button data-testid="cart-drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close" className="p-2 hover:text-[color:var(--pl-orange)]"><X /></button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {(!cart.items || cart.items.length === 0) ? (
                  <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-16">
                    <div className="text-6xl font-display text-neutral-200">P&amp;L</div>
                    <div className="font-display uppercase tracking-widest text-sm">Your bag is empty</div>
                    <p className="text-neutral-500 text-sm max-w-xs">Browse the drops — anime panels, JDM icons, and pocket-flex keychains are waiting.</p>
                    <Link to="/shop" onClick={() => setDrawerOpen(false)} className="pl-btn pl-btn-dark mt-2">Continue Shopping</Link>
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {cart.items.map((it) => (
                      <li key={it.product_id} className="flex gap-4">
                        <Link to={`/product/${it.product.slug}`} onClick={() => setDrawerOpen(false)} className="w-20 h-24 bg-neutral-100 shrink-0">
                          <MediaImg src={it.product?.images?.[0]} alt={it.product?.name} className="w-full h-full object-cover" />
                        </Link>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] uppercase tracking-widest text-neutral-500">{it.product.category_slug}</div>
                          <div className="font-display uppercase text-sm truncate">{it.product.name}</div>
                          <div className="mt-1 text-sm font-tabular font-semibold">{formatINR(it.product.final_price)}</div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="inline-flex items-center border border-neutral-300">
                              <button data-testid={`cart-qty-dec-${it.product.slug}`} onClick={() => updateQty(it.product_id, it.quantity - 1)} className="p-1.5 hover:bg-neutral-100"><Minus className="w-3 h-3" /></button>
                              <span className="px-3 text-sm font-tabular">{it.quantity}</span>
                              <button data-testid={`cart-qty-inc-${it.product.slug}`} onClick={() => updateQty(it.product_id, it.quantity + 1)} className="p-1.5 hover:bg-neutral-100"><Plus className="w-3 h-3" /></button>
                            </div>
                            <button data-testid={`cart-remove-${it.product.slug}`} onClick={() => removeItem(it.product_id)} aria-label="Remove" className="text-neutral-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {cart.items?.length > 0 && (
                <div className="border-t border-neutral-200 px-6 py-5 space-y-3">
                  <div className="flex justify-between text-sm"><span className="text-neutral-600">Subtotal</span><span className="font-tabular">{formatINR(cart.subtotal)}</span></div>
                  {cart.discount_total > 0 && (
                    <div className="flex justify-between text-sm text-[color:var(--pl-orange)]"><span>Discount</span><span className="font-tabular">−{formatINR(cart.discount_total)}</span></div>
                  )}
                  <div className="flex justify-between text-sm"><span className="text-neutral-600">Delivery</span><span className="font-tabular text-green-700 uppercase tracking-widest text-xs font-bold">No delivery charges</span></div>
                  <div className="flex justify-between items-baseline pt-2 border-t border-neutral-100">
                    <span className="font-display uppercase text-sm tracking-widest">Total</span>
                    <motion.span
                      key={cart.total}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      className="font-display font-bold text-2xl font-tabular"
                      data-testid="cart-total"
                    >
                      {formatINR(cart.total)}
                    </motion.span>
                  </div>
                  <button data-testid="cart-checkout-btn" onClick={goCheckout} className="pl-btn pl-btn-primary w-full mt-2">Checkout</button>
                  <button onClick={() => setDrawerOpen(false)} className="pl-btn pl-btn-ghost-light w-full">Continue Shopping</button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
