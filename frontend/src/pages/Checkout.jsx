import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { formatINR } from "@/lib/format";
import { MediaImg } from "@/components/MediaImg";
import { DeliveryAddressDisplay } from "@/components/DeliveryAddressDisplay";
import {
  DELIVERY_WOXSEN,
  DELIVERY_OUTSIDE,
  WOXSEN_TOWERS,
  CHECKOUT_DELIVERY_KEY,
} from "@/lib/delivery";
import { toast } from "sonner";

const inputCls = "w-full mt-1 border-b border-neutral-300 focus:border-black bg-transparent py-2 focus:outline-none";
const labelCls = "text-[10px] uppercase tracking-widest text-neutral-500";

const emptyWoxsen = (user) => ({
  customer_name: user?.name || "",
  phone: user?.phone || "",
  email: user?.email || "",
  tower: "",
  towerOther: "",
  room_number: "",
  delivery_instructions: "",
});

const emptyOutside = (user) => ({
  customer_name: user?.name || "",
  phone: user?.phone || "",
  email: user?.email || "",
  address_line1: user?.address_line1 || "",
  address_line2: user?.address_line2 || "",
  address_line3: "",
  landmark: "",
  city: user?.city || "",
  state: user?.state || "",
  pincode: user?.pincode || "",
  country: "India",
});

const Checkout = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const { cart, refresh } = useCart();
  const [deliveryType, setDeliveryType] = useState(() => {
    try {
      return sessionStorage.getItem(CHECKOUT_DELIVERY_KEY) || DELIVERY_OUTSIDE;
    } catch {
      return DELIVERY_OUTSIDE;
    }
  });
  const [woxsenForm, setWoxsenForm] = useState(() => emptyWoxsen(user));
  const [outsideForm, setOutsideForm] = useState(() => emptyOutside(user));
  const [orderNote, setOrderNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    setWoxsenForm((f) => ({
      ...f,
      customer_name: f.customer_name || user.name || "",
      phone: f.phone || user.phone || "",
      email: f.email || user.email || "",
    }));
    setOutsideForm((f) => ({
      ...f,
      customer_name: f.customer_name || user.name || "",
      phone: f.phone || user.phone || "",
      email: f.email || user.email || "",
      address_line1: f.address_line1 || user.address_line1 || "",
      address_line2: f.address_line2 || user.address_line2 || "",
      city: f.city || user.city || "",
      state: f.state || user.state || "",
      pincode: f.pincode || user.pincode || "",
    }));
  }, [user]);

  useEffect(() => {
    try {
      sessionStorage.setItem(CHECKOUT_DELIVERY_KEY, deliveryType);
    } catch { /* ignore */ }
  }, [deliveryType]);

  const previewOrder = useMemo(() => {
    if (deliveryType === DELIVERY_WOXSEN) {
      const tower = woxsenForm.tower === "Other" ? woxsenForm.towerOther : woxsenForm.tower;
      return {
        delivery_type: DELIVERY_WOXSEN,
        customer_name: woxsenForm.customer_name,
        customer_email: woxsenForm.email,
        phone: woxsenForm.phone,
        tower,
        room_number: woxsenForm.room_number,
        delivery_instructions: woxsenForm.delivery_instructions,
      };
    }
    return {
      delivery_type: DELIVERY_OUTSIDE,
      customer_name: outsideForm.customer_name,
      customer_email: outsideForm.email,
      phone: outsideForm.phone,
      address_line1: outsideForm.address_line1,
      address_line2: outsideForm.address_line2,
      address_line3: outsideForm.address_line3,
      landmark: outsideForm.landmark,
      city: outsideForm.city,
      state: outsideForm.state,
      pincode: outsideForm.pincode,
      country: outsideForm.country,
    };
  }, [deliveryType, woxsenForm, outsideForm]);

  const validate = () => {
    if (deliveryType === DELIVERY_WOXSEN) {
      const tower = woxsenForm.tower === "Other" ? woxsenForm.towerOther : woxsenForm.tower;
      if (!woxsenForm.customer_name.trim()) return "Full name is required";
      if (!woxsenForm.phone.trim()) return "Mobile number is required";
      if (!tower?.trim()) return "Tower / Hostel is required";
      if (!woxsenForm.room_number.trim()) return "Room number is required";
    } else {
      if (!outsideForm.customer_name.trim()) return "Full name is required";
      if (!outsideForm.phone.trim()) return "Mobile number is required";
      if (!outsideForm.address_line1.trim()) return "Address line 1 is required";
      if (!outsideForm.city.trim()) return "City is required";
      if (!outsideForm.state.trim()) return "State is required";
      if (!outsideForm.pincode.trim()) return "Pincode is required";
    }
    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!cart.items?.length) return toast.error("Your bag is empty");
    const err = validate();
    if (err) return toast.error(err);

    const payload =
      deliveryType === DELIVERY_WOXSEN
        ? {
            delivery_type: DELIVERY_WOXSEN,
            customer_name: woxsenForm.customer_name.trim(),
            phone: woxsenForm.phone.trim(),
            email: woxsenForm.email.trim() || undefined,
            tower: (woxsenForm.tower === "Other" ? woxsenForm.towerOther : woxsenForm.tower).trim(),
            room_number: woxsenForm.room_number.trim(),
            delivery_instructions: woxsenForm.delivery_instructions.trim(),
            order_note: orderNote,
          }
        : {
            delivery_type: DELIVERY_OUTSIDE,
            customer_name: outsideForm.customer_name.trim(),
            phone: outsideForm.phone.trim(),
            email: outsideForm.email.trim() || undefined,
            address_line1: outsideForm.address_line1.trim(),
            address_line2: outsideForm.address_line2.trim(),
            address_line3: outsideForm.address_line3.trim(),
            landmark: outsideForm.landmark.trim(),
            city: outsideForm.city.trim(),
            state: outsideForm.state.trim(),
            pincode: outsideForm.pincode.trim(),
            country: outsideForm.country.trim() || "India",
            order_note: orderNote,
          };

    setBusy(true);
    try {
      const { data } = await api.post("/orders/checkout", payload);
      nav(`/checkout/payment/${data.id}`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map((d) => d.msg || d).join(", ")
        : detail || "Checkout failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const deliveryOptions = [
    { key: DELIVERY_WOXSEN, emoji: "🏫", title: "Woxsen University", desc: "Campus delivery to your hostel" },
    { key: DELIVERY_OUTSIDE, emoji: "🏠", title: "Outside Woxsen", desc: "Ship to your home address" },
  ];

  return (
    <div className="pl-section-light py-16 min-h-screen">
      <div className="pl-container">
        <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Step 1 of 3 · Review</div>
        <h1 className="font-display uppercase text-editorial mb-10">Almost yours.</h1>

        <form onSubmit={submit} className="grid lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-8">
            <div className="border border-neutral-200 p-6 md:p-8">
              <h2 className="font-display uppercase text-xl mb-2">Shipping Address</h2>
              <p className="text-sm text-neutral-600 mb-6">Where should we deliver your order?</p>

              <div className="grid sm:grid-cols-2 gap-3 mb-8" role="radiogroup" aria-label="Delivery location">
                {deliveryOptions.map((opt) => {
                  const selected = deliveryType === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-testid={`delivery-type-${opt.key}`}
                      onClick={() => setDeliveryType(opt.key)}
                      className={`text-left p-4 border-2 transition-all duration-200 ${
                        selected
                          ? "border-black bg-neutral-50 shadow-sm"
                          : "border-neutral-200 hover:border-neutral-400"
                      }`}
                    >
                      <div className="text-2xl mb-2">{opt.emoji}</div>
                      <div className="font-display uppercase text-sm">{opt.title}</div>
                      <div className="text-xs text-neutral-500 mt-1">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>

              <div
                className="transition-all duration-300 ease-out"
                key={deliveryType}
              >
                {deliveryType === DELIVERY_WOXSEN ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 md:col-span-1">
                      <label className={labelCls}>Full Name *</label>
                      <input
                        data-testid="checkout-customer_name"
                        value={woxsenForm.customer_name}
                        onChange={(e) => setWoxsenForm({ ...woxsenForm, customer_name: e.target.value })}
                        className={inputCls}
                        required
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label className={labelCls}>Mobile Number *</label>
                      <input
                        data-testid="checkout-phone"
                        type="tel"
                        value={woxsenForm.phone}
                        onChange={(e) => setWoxsenForm({ ...woxsenForm, phone: e.target.value })}
                        className={inputCls}
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>Email</label>
                      <input
                        data-testid="checkout-email"
                        type="email"
                        value={woxsenForm.email}
                        readOnly={Boolean(user?.email)}
                        onChange={(e) => !user?.email && setWoxsenForm({ ...woxsenForm, email: e.target.value })}
                        className={`${inputCls} ${user?.email ? "text-neutral-500 cursor-default" : ""}`}
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label className={labelCls}>Tower / Hostel *</label>
                      <select
                        data-testid="checkout-tower"
                        value={woxsenForm.tower}
                        onChange={(e) => setWoxsenForm({ ...woxsenForm, tower: e.target.value })}
                        className={`${inputCls} border-b`}
                        required={woxsenForm.tower !== "Other"}
                      >
                        <option value="">Select tower / hostel</option>
                        {WOXSEN_TOWERS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                        <option value="Other">Other (specify)</option>
                      </select>
                      {woxsenForm.tower === "Other" && (
                        <input
                          data-testid="checkout-tower-other"
                          value={woxsenForm.towerOther}
                          onChange={(e) => setWoxsenForm({ ...woxsenForm, towerOther: e.target.value })}
                          placeholder="Enter tower / hostel name"
                          className={`${inputCls} mt-2`}
                          required
                        />
                      )}
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label className={labelCls}>Room Number *</label>
                      <input
                        data-testid="checkout-room_number"
                        value={woxsenForm.room_number}
                        onChange={(e) => setWoxsenForm({ ...woxsenForm, room_number: e.target.value })}
                        className={inputCls}
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>Additional Instructions (optional)</label>
                      <textarea
                        data-testid="checkout-delivery_instructions"
                        value={woxsenForm.delivery_instructions}
                        onChange={(e) => setWoxsenForm({ ...woxsenForm, delivery_instructions: e.target.value.slice(0, 200) })}
                        rows={2}
                        placeholder="Floor, wing, or drop-off notes"
                        className="w-full mt-1 border border-neutral-200 p-3 focus:outline-none focus:border-black bg-transparent"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 md:col-span-1">
                      <label className={labelCls}>Full Name *</label>
                      <input
                        data-testid="checkout-customer_name"
                        value={outsideForm.customer_name}
                        onChange={(e) => setOutsideForm({ ...outsideForm, customer_name: e.target.value })}
                        className={inputCls}
                        required
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label className={labelCls}>Mobile Number *</label>
                      <input
                        data-testid="checkout-phone"
                        type="tel"
                        value={outsideForm.phone}
                        onChange={(e) => setOutsideForm({ ...outsideForm, phone: e.target.value })}
                        className={inputCls}
                        required
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>Email</label>
                      <input
                        data-testid="checkout-email"
                        type="email"
                        value={outsideForm.email}
                        readOnly={Boolean(user?.email)}
                        onChange={(e) => !user?.email && setOutsideForm({ ...outsideForm, email: e.target.value })}
                        className={`${inputCls} ${user?.email ? "text-neutral-500 cursor-default" : ""}`}
                      />
                    </div>
                    {[
                      ["address_line1", "Address Line 1", 2, true],
                      ["address_line2", "Address Line 2", 2, true],
                      ["address_line3", "Address Line 3", 2, false],
                      ["landmark", "Landmark", 2, false],
                      ["city", "City", 1, true],
                      ["state", "State", 1, true],
                      ["pincode", "Pincode", 1, true],
                      ["country", "Country", 1, true],
                    ].map(([k, label, span, req]) => (
                      <div key={k} className={span === 2 ? "col-span-2" : "col-span-2 md:col-span-1"}>
                        <label className={labelCls}>{label}{req ? " *" : ""}</label>
                        <input
                          data-testid={`checkout-${k}`}
                          value={outsideForm[k]}
                          required={req}
                          onChange={(e) => setOutsideForm({ ...outsideForm, [k]: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="border border-neutral-200 p-6 md:p-8">
              <h2 className="font-display uppercase text-xl mb-4">Order note (optional)</h2>
              <textarea
                data-testid="checkout-note"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value.slice(0, 200))}
                placeholder="Gift wrap? Special request?"
                maxLength={200}
                rows={3}
                className="w-full border border-neutral-200 p-3 focus:outline-none focus:border-black bg-transparent"
              />
              <div className="text-[10px] uppercase tracking-widest text-neutral-400 mt-1">{orderNote.length}/200</div>
            </div>
          </div>

          <div className="border border-neutral-200 p-6 h-fit space-y-4">
            <h2 className="font-display uppercase text-xl">Your bag</h2>
            <ul className="divide-y divide-neutral-100">
              {cart.items?.map((it) => (
                <li key={it.product_id} className="py-3 flex gap-3 text-sm">
                  <MediaImg src={it.product?.images?.[0]} alt="" className="w-12 h-14 object-cover bg-neutral-100" />
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

            <div className="pt-4 border-t border-neutral-200">
              <DeliveryAddressDisplay order={previewOrder} testId="checkout-delivery-preview" />
            </div>

            <button data-testid="checkout-proceed" disabled={busy || !cart.items?.length} className="pl-btn pl-btn-primary w-full">
              {busy ? "Placing…" : "Proceed to Payment →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default Checkout;
