import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { formatINR, formatDate, statusLabel, statusColor, paymentStatusLabel, paymentStatusColor } from "@/lib/format";
import { resolveMedia } from "@/lib/media";
import { toast } from "sonner";

const FLOW = ["placed", "payment_under_validation", "approved", "preparing", "packed", "out_for_delivery", "delivered"];

const OrderDetail = () => {
  const { id } = useParams();
  const [o, setO] = useState(null);
  const load = () => api.get(`/orders/${id}`).then((r) => setO(r.data));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const advance = async (newStatus) => {
    try { await api.put(`/admin/orders/${id}/status`, { status: newStatus }); toast.success(`Marked ${statusLabel(newStatus)}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const approvePayment = async () => {
    try {
      await api.post(`/admin/orders/${id}/approve-payment`, { note: "Payment verified" });
      toast.success("Payment approved");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const rejectPayment = async () => {
    try {
      await api.post(`/admin/orders/${id}/reject-payment`, { note: "Payment rejected — please resubmit" });
      toast.success("Payment rejected");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const setDeliveryDate = async (date) => {
    try { await api.put(`/admin/orders/${id}/delivery-date`, { delivery_date: date }); toast.success("Delivery date set"); load(); }
    catch { toast.error("Failed"); }
  };

  if (!o) return <div>Loading…</div>;
  const currentIdx = FLOW.indexOf(o.status);
  const nextStatus = currentIdx >= 0 && currentIdx < FLOW.length - 1 ? FLOW[currentIdx + 1] : null;
  const awaitingPayment = o.status === "payment_under_validation"
    || (o.status === "placed" && o.payment_status === "under_validation");

  return (
    <div>
      <Link to="/admin/orders" className="text-xs uppercase tracking-widest text-neutral-500 hover:text-white">← All orders</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display uppercase text-3xl">{o.order_number}</h1>
        <span className={`text-[11px] uppercase tracking-widest px-2 py-1 ${statusColor(o.status)}`} data-testid="admin-order-status">{statusLabel(o.status)}</span>
        <span className={`text-[11px] uppercase tracking-widest px-2 py-1 ${paymentStatusColor(o.payment_status)}`} data-testid="admin-payment-status">{paymentStatusLabel(o.payment_status)}</span>
      </div>
      <div className="text-sm text-neutral-500">{formatDate(o.created_at)}</div>

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 p-5">
            <h2 className="font-display uppercase text-lg mb-4">Items</h2>
            <ul className="divide-y divide-neutral-800">
              {o.items.map((it) => (
                <li key={it.product_id} className="py-3 flex gap-4">
                  <img src={it.product_image} alt="" className="w-14 h-16 object-cover bg-neutral-800" />
                  <div className="flex-1">
                    <div className="text-sm">{it.product_name}</div>
                    <div className="text-xs text-neutral-500">Qty {it.quantity} × {formatINR(it.final_price)}</div>
                  </div>
                  <div className="font-tabular">{formatINR(it.line_total)}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5">
            <h2 className="font-display uppercase text-lg mb-4">Timeline</h2>
            <ol className="space-y-2">
              {o.timeline?.map((t, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="text-neutral-500 text-xs w-40 shrink-0">{formatDate(t.at)}</span>
                  <span className="uppercase tracking-widest text-xs">{statusLabel(t.status)}</span>
                  {t.note && <span className="text-neutral-400 text-xs">— {t.note}</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 p-5 space-y-3">
            <h2 className="font-display uppercase text-lg">Summary</h2>
            <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-tabular">{formatINR(o.subtotal)}</span></div>
            {o.discount_total > 0 && <div className="flex justify-between text-sm text-[color:var(--pl-orange)]"><span>Discount</span><span className="font-tabular">−{formatINR(o.discount_total)}</span></div>}
            <div className="flex justify-between text-sm"><span>Delivery</span><span className="text-green-500 text-xs uppercase tracking-widest">Free</span></div>
            <div className="flex justify-between font-display text-xl pt-2 border-t border-neutral-800"><span>Total</span><span className="font-tabular">{formatINR(o.total)}</span></div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5">
            <h2 className="font-display uppercase text-lg mb-3">Customer</h2>
            <div className="text-sm space-y-1">
              <div>{o.customer_name}</div>
              <div className="text-neutral-400">{o.customer_email}</div>
              <div className="text-neutral-400">{o.phone}</div>
              <div className="text-neutral-400 text-xs mt-2">{o.address_line1}, {o.address_line2}, {o.city} {o.state} {o.pincode}</div>
              {o.transaction_id && (
                <div className="mt-3 pt-3 border-t border-neutral-800">
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500">Txn ID</div>
                  <div className="font-mono text-xs">{o.transaction_id}</div>
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500 mt-2">Payment status</div>
                  <div className="text-xs">{o.payment_status || "pending"}</div>
                </div>
              )}
              {o.payment_screenshot_url && (
                <div className="mt-3 pt-3 border-t border-neutral-800">
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">Payment screenshot</div>
                  <a href={resolveMedia(o.payment_screenshot_url)} target="_blank" rel="noreferrer">
                    <img src={resolveMedia(o.payment_screenshot_url)} alt="Payment proof" className="w-full max-h-48 object-contain bg-neutral-800" />
                  </a>
                </div>
              )}
              {o.order_note && (
                <div className="mt-3 pt-3 border-t border-neutral-800">
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500">Order note</div>
                  <div className="text-xs">{o.order_note}</div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5 space-y-3">
            <h2 className="font-display uppercase text-lg">Actions</h2>
            {awaitingPayment && (
              <>
                <button data-testid="admin-approve-payment" onClick={approvePayment} className="pl-btn pl-btn-primary w-full">
                  Approve Payment
                </button>
                <button data-testid="admin-reject-payment" onClick={rejectPayment} className="pl-btn pl-btn-ghost-dark w-full">
                  Reject Payment
                </button>
              </>
            )}
            {o.status !== "cancelled" && o.status !== "delivered" && (
              <>
                {nextStatus && !awaitingPayment && (
                  <button data-testid="admin-advance-status" onClick={() => advance(nextStatus)} className="pl-btn pl-btn-primary w-full">
                    Mark as {statusLabel(nextStatus)} →
                  </button>
                )}
                {nextStatus && awaitingPayment && nextStatus !== "approved" && (
                  <button data-testid="admin-advance-status" onClick={() => advance(nextStatus)} className="pl-btn pl-btn-ghost-dark w-full">
                    Mark as {statusLabel(nextStatus)} →
                  </button>
                )}
                <button onClick={() => advance("cancelled")} className="pl-btn pl-btn-ghost-dark w-full text-red-500 border-red-500 hover:bg-red-500 hover:text-white">Cancel Order</button>
              </>
            )}
            <div>
              <label className="text-[10px] uppercase tracking-widest text-neutral-500">Delivery Date</label>
              <input
                data-testid="admin-delivery-date"
                type="date"
                defaultValue={o.delivery_date ? o.delivery_date.slice(0, 10) : ""}
                onChange={(e) => e.target.value && setDeliveryDate(new Date(e.target.value).toISOString())}
                className="w-full mt-1 bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-sm focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default OrderDetail;
