import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { formatINR } from "@/lib/format";
import { resolveMedia } from "@/lib/media";
import { toast } from "sonner";

const Checkout = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const { cart, refresh } = useCart();
  const [form, setForm] = useState({
    address_line1: user?.address_line1 || "",
    address_line2: user?.address_line2 || "",
    city: user?.city || "",
    state: user?.state || "",
    pincode: user?.pincode || "",
    phone: user?.phone || "",
    order_note: "",
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => { refresh(); }, [refresh]);

  const submit = async (e) => {
    e.preventDefault();
    if (!cart.items?.length) return toast.error("Your bag is empty");
    setBusy(true);
    try {
      const { data } = await api.post("/orders/checkout", form);
      nav(`/checkout/payment/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Checkout failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="pl-section-light py-16 min-h-screen">
      <div className="pl-container">
        <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Step 1 of 3 · Review</div>
        <h1 className="font-display uppercase text-editorial mb-10">Almost yours.</h1>

        <form onSubmit={submit} className="grid lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-8">
            <div className="border border-neutral-200 p-6 md:p-8">
              <h2 className="font-display uppercase text-xl mb-6">Ship to</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  ["address_line1", "Address line 1", 2, true],
                  ["address_line2", "Address line 2", 2, false],
                  ["city", "City", 1, true],
                  ["state", "State", 1, true],
                  ["pincode", "Pincode", 1, true],
                  ["phone", "Phone", 1, true],
                ].map(([k, label, span, req]) => (
                  <div key={k} className={span === 2 ? "col-span-2" : "col-span-2 md:col-span-1"}>
                    <label className="text-[10px] uppercase tracking-widest text-neutral-500">{label}{req ? " *" : ""}</label>
                    <input
                      data-testid={`checkout-${k}`}
                      value={form[k]} required={req}
                      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                      className="w-full mt-1 border-b border-neutral-300 focus:border-black bg-transparent py-2 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-neutral-200 p-6 md:p-8">
              <h2 className="font-display uppercase text-xl mb-4">Order note (optional)</h2>
              <textarea
                data-testid="checkout-note"
                value={form.order_note}
                onChange={(e) => setForm({ ...form, order_note: e.target.value.slice(0, 200) })}
                placeholder="Gift wrap? Delivery instruction?"
                maxLength={200}
                rows={3}
                className="w-full border border-neutral-200 p-3 focus:outline-none focus:border-black bg-transparent"
              />
              <div className="text-[10px] uppercase tracking-widest text-neutral-400 mt-1">{form.order_note.length}/200</div>
            </div>
          </div>

          <div className="border border-neutral-200 p-6 h-fit space-y-4">
            <h2 className="font-display uppercase text-xl">Your bag</h2>
            <ul className="divide-y divide-neutral-100">
              {cart.items?.map((it) => (
                <li key={it.product_id} className="py-3 flex gap-3 text-sm">
                  <img src={resolveMedia(it.product?.images?.[0])} alt="" className="w-12 h-14 object-cover bg-neutral-100" />
                  <div className="flex-1 min-w-0">
                    <div className="uppercase tracking-tight truncate">{it.product.name}</div>
                    <div className="text-xs text-neutral-500">× {it.quantity}</div>
                  </div>
                  <div className="font-tabular font-semibold">{formatINR(it.line_total)}</div>
                </li>
              ))}
            </ul>
            <div className="flex justify-between text-sm pt-2 border-t"><span>Subtotal</span><span className="font-tabular">{formatINR(cart.subtotal)}</span></div>
            {cart.discount_total > 0 && <div className="flex justify-between text-sm text-[color:var(--pl-orange)]"><span>Discount</span><span className="font-tabular">−{formatINR(cart.discount_total)}</span></div>}
            <div className="flex justify-between text-sm"><span>Delivery</span><span className="text-green-700 uppercase tracking-widest text-[10px] font-bold">No delivery charges</span></div>
            <div className="flex justify-between items-baseline pt-3 border-t"><span className="font-display uppercase">Total</span><span className="font-display text-2xl font-bold font-tabular">{formatINR(cart.total)}</span></div>
            <button data-testid="checkout-proceed" disabled={busy || !cart.items?.length} className="pl-btn pl-btn-primary w-full">{busy ? "Placing…" : "Proceed to Payment →"}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default Checkout;
