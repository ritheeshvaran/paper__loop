import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { asArray } from "@/lib/lists";
import { formatDate, statusLabel, statusColor, orderDisplayKey } from "@/lib/format";
import { toast } from "sonner";

const Account = () => {
  const { user, updateProfile, logout } = useAuth();
  const [form, setForm] = useState(user || {});
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState([]);
  const [canReview, setCanReview] = useState(false);
  const [review, setReview] = useState({ rating: 5, title: "", quote: "", photo_url: "" });
  const [reviewBusy, setReviewBusy] = useState(false);
  useEffect(() => { if (user) setForm(user); }, [user]);
  useEffect(() => {
    api.get("/orders").then((r) => {
      const list = asArray(r.data);
      setOrders(list.slice(0, 3));
      setCanReview(list.some((o) =>
        o.payment_status === "verified"
        || ["approved", "preparing", "packed", "out_for_delivery", "delivered"].includes(o.status)
      ));
    }).catch(() => setOrders([]));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({
        name: form.name, phone: form.phone,
        address_line1: form.address_line1, address_line2: form.address_line2,
        city: form.city, state: form.state, pincode: form.pincode,
      });
      toast.success("Profile updated");
    } catch { toast.error("Couldn't save"); } finally { setSaving(false); }
  };

  return (
    <div className="pl-section-light py-16">
      <div className="pl-container">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 mb-12">
          <div className="w-20 h-20 rounded-full bg-[color:var(--pl-orange)] text-white flex items-center justify-center font-display text-2xl">
            {(user?.name || "P").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-neutral-500">Your Account</div>
            <h1 className="font-display uppercase text-4xl md:text-5xl">Hey, {user?.name?.split(" ")[0] || "friend"}.</h1>
          </div>
          <div className="md:ml-auto flex gap-2">
            {user?.role === "admin" && <Link to="/admin" data-testid="link-admin" className="pl-btn pl-btn-dark">Admin</Link>}
            <button data-testid="logout-btn" onClick={() => { logout(); toast("Signed out"); }} className="pl-btn pl-btn-ghost-light">Sign out</button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 border border-neutral-200 p-6 md:p-8">
            <h2 className="font-display uppercase text-2xl mb-6">Profile</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                ["name", "Full name", 2], ["email", "Email", 2, true],
                ["phone", "Phone", 2],
                ["address_line1", "Address line 1", 2],
                ["address_line2", "Address line 2", 2],
                ["city", "City", 1], ["state", "State", 1],
                ["pincode", "Pincode", 2],
              ].map(([k, label, span, ro]) => (
                <div key={k} className={span === 2 ? "col-span-2" : "col-span-2 md:col-span-1"}>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</label>
                  <input
                    data-testid={`profile-${k}`}
                    value={form[k] || ""} readOnly={ro}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    className="w-full mt-1 border-b border-neutral-300 focus:border-black bg-transparent py-2 focus:outline-none disabled:opacity-60"
                  />
                </div>
              ))}
            </div>
            <button data-testid="profile-save" onClick={save} disabled={saving} className="pl-btn pl-btn-primary mt-6">{saving ? "Saving…" : "Save Profile"}</button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display uppercase text-2xl">Recent Orders</h2>
              <Link to="/account/orders" className="text-xs uppercase tracking-widest font-bold hover:text-[color:var(--pl-orange)]">All →</Link>
            </div>
            {orders.length === 0 ? (
              <div className="border border-neutral-200 p-6 text-sm text-neutral-500">No orders yet. <Link to="/collections" className="underline">Start shopping</Link></div>
            ) : (
              <ul className="space-y-3">
                {orders.map((o) => {
                  const key = orderDisplayKey(o);
                  return (
                  <li key={o.id}>
                    <Link to={`/account/orders/${o.id}`} className="block border border-neutral-200 p-4 hover:border-black transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs">{o.order_number}</span>
                        <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 ${statusColor(key)}`}>{statusLabel(key)}</span>
                      </div>
                      <div className="mt-2 text-sm">{o.items.length} item{o.items.length > 1 ? "s" : ""} · {formatDate(o.created_at)}</div>
                    </Link>
                  </li>
                  );
                })}
              </ul>
            )}
            <Link to="/account/wishlist" data-testid="link-wishlist" className="mt-6 block border border-neutral-200 p-4 text-sm hover:border-black">
              Wishlist →
            </Link>

            {canReview && user?.role !== "admin" && (
              <form
                data-testid="review-form"
                className="mt-6 border border-neutral-200 p-4 space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setReviewBusy(true);
                  try {
                    await api.post("/reviews", review);
                    toast.success("Review submitted — thank you!");
                    setReview({ rating: 5, title: "", quote: "", photo_url: "" });
                    setCanReview(false);
                  } catch (err) {
                    toast.error(err.response?.data?.detail || "Couldn't submit review");
                  } finally {
                    setReviewBusy(false);
                  }
                }}
              >
                <div className="font-display uppercase text-lg">Write a review</div>
                <p className="text-xs text-neutral-500">Verified purchase required. Newest reviews appear on the homepage.</p>
                <label className="text-[10px] uppercase tracking-widest text-neutral-500">Rating</label>
                <select
                  data-testid="review-rating"
                  value={review.rating}
                  onChange={(e) => setReview({ ...review, rating: Number(e.target.value) })}
                  className="w-full border-b border-neutral-300 py-2 bg-transparent focus:outline-none"
                >
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}
                </select>
                <input
                  data-testid="review-title"
                  required
                  placeholder="Title"
                  value={review.title}
                  onChange={(e) => setReview({ ...review, title: e.target.value })}
                  className="w-full border-b border-neutral-300 py-2 bg-transparent focus:outline-none"
                />
                <textarea
                  data-testid="review-body"
                  required
                  rows={3}
                  placeholder="Your review"
                  value={review.quote}
                  onChange={(e) => setReview({ ...review, quote: e.target.value })}
                  className="w-full border-b border-neutral-300 py-2 bg-transparent focus:outline-none"
                />
                <input
                  data-testid="review-image"
                  placeholder="Image URL (optional)"
                  value={review.photo_url}
                  onChange={(e) => setReview({ ...review, photo_url: e.target.value })}
                  className="w-full border-b border-neutral-300 py-2 bg-transparent focus:outline-none"
                />
                <button disabled={reviewBusy} className="pl-btn pl-btn-primary w-full" data-testid="review-submit">
                  {reviewBusy ? "Submitting…" : "Submit Review"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Account;
