import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import {
  formatDate,
  formatINR,
  statusLabel,
  statusColor,
  paymentStatusLabel,
  paymentStatusColor,
  CUSTOMER_ORDER_FLOW,
} from "@/lib/format";
import { resolveMedia } from "@/lib/media";
import { toast } from "sonner";
import { CheckCircle2, Circle, XCircle } from "lucide-react";

const OrderDetail = () => {
  const { id } = useParams();
  const [o, setO] = useState(null);

  const load = () => api.get(`/orders/${id}`).then((r) => setO(r.data));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const cancel = async () => {
    if (!window.confirm("Cancel this order? This cannot be undone.")) return;
    try { await api.post(`/orders/${id}/cancel`); toast.success("Order cancelled"); load(); }
    catch { toast.error("Couldn't cancel"); }
  };

  if (!o) return <div className="min-h-[60vh] flex items-center justify-center">Loading…</div>;
  const cancelled = o.status === "cancelled";
  const rejected = o.payment_status === "rejected";
  // Map approved+ to final step on simplified timeline
  const timelineStatus = ["approved", "preparing", "packed", "out_for_delivery", "delivered"].includes(o.status)
    ? "approved"
    : o.status;
  const currentIdx = CUSTOMER_ORDER_FLOW.indexOf(timelineStatus);

  return (
    <div className="pl-section-light py-16">
      <div className="pl-container">
        <Link to="/account/orders" className="text-xs uppercase tracking-widest text-neutral-500 hover:text-black">← All orders</Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display uppercase text-3xl md:text-4xl" data-testid="order-number">Order {o.order_number}</h1>
          <span className={`text-[11px] uppercase tracking-widest px-2 py-1 ${statusColor(o.status)}`} data-testid="order-status">
            {statusLabel(o.status)}
          </span>
          <span className={`text-[11px] uppercase tracking-widest px-2 py-1 ${paymentStatusColor(o.payment_status)}`} data-testid="payment-status">
            {paymentStatusLabel(o.payment_status)}
          </span>
        </div>
        <div className="text-sm text-neutral-500 mt-1">Placed on {formatDate(o.created_at)}</div>

        {rejected && (
          <div className="mt-6 border border-red-200 bg-red-50 p-5" data-testid="payment-rejected-banner">
            <div className="font-display uppercase text-red-700">Payment Rejected</div>
            <p className="text-sm text-red-800 mt-1">
              {o.timeline?.filter((t) => t.note)?.slice(-1)[0]?.note || "Please resubmit a valid UPI transaction ID."}
            </p>
            <Link to={`/checkout/payment/${o.id}`} data-testid="retry-payment-btn" className="pl-btn pl-btn-primary mt-4 inline-flex">
              Retry Payment →
            </Link>
          </div>
        )}

        {/* Timeline — purchase states only */}
        <div className="mt-10 border border-neutral-200 p-6 md:p-8">
          <div className="flex items-center justify-between mb-2 text-[11px] uppercase tracking-widest text-neutral-500">
            <span>Order Status</span>
          </div>
          {cancelled ? (
            <div className="flex items-center gap-3 mt-6 text-red-600">
              <XCircle className="w-6 h-6" />
              <div>
                <div className="font-display uppercase">Order Cancelled</div>
                <div className="text-xs text-neutral-500">{formatDate(o.cancelled_at)}</div>
              </div>
            </div>
          ) : (
            <div className="relative mt-8">
              <div className="absolute left-3 top-3 bottom-3 w-px bg-neutral-200" />
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(0, (Math.max(currentIdx, 0) / (CUSTOMER_ORDER_FLOW.length - 1)) * 100)}%` }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="absolute left-3 top-3 w-px bg-[color:var(--pl-orange)]"
              />
              <ol className="space-y-6 relative">
                {CUSTOMER_ORDER_FLOW.map((s, i) => {
                  const done = currentIdx >= 0 && i <= currentIdx;
                  return (
                    <motion.li
                      key={s}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.12 }}
                      className="flex items-start gap-4"
                    >
                      <div className="mt-0.5">
                        {done ? <CheckCircle2 className="w-6 h-6 text-[color:var(--pl-orange)] bg-white" /> : <Circle className="w-6 h-6 text-neutral-300 bg-white" />}
                      </div>
                      <div>
                        <div className={`font-display uppercase ${done ? "" : "text-neutral-400"}`}>{statusLabel(s)}</div>
                        {s === "approved" && o.payment_status === "verified" && done && (
                          <div className="text-xs text-green-700 mt-0.5">✔ Payment Approved</div>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>

        <div className="mt-10 grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 border border-neutral-200 p-6">
            <h2 className="font-display uppercase text-xl mb-6">Items</h2>
            <ul className="divide-y divide-neutral-200">
              {o.items.map((it) => (
                <li key={it.product_id} className="py-4 flex gap-4">
                  <img src={resolveMedia(it.product_image)} alt={it.product_name} className="w-20 h-24 object-cover bg-neutral-100" />
                  <div className="flex-1">
                    <div className="font-display uppercase">{it.product_name}</div>
                    <div className="text-xs text-neutral-500">Qty {it.quantity} × {formatINR(it.final_price)}</div>
                  </div>
                  <div className="font-tabular font-bold">{formatINR(it.line_total)}</div>
                </li>
              ))}
            </ul>
            {o.order_note && (
              <div className="mt-6 border-t border-neutral-200 pt-4">
                <div className="text-[11px] uppercase tracking-widest text-neutral-500">Order Note</div>
                <p className="text-sm mt-1">{o.order_note}</p>
              </div>
            )}
          </div>

          <div className="border border-neutral-200 p-6 space-y-4">
            <h2 className="font-display uppercase text-xl">Summary</h2>
            <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-tabular">{formatINR(o.subtotal)}</span></div>
            {o.discount_total > 0 && <div className="flex justify-between text-sm text-[color:var(--pl-orange)]"><span>Discount</span><span className="font-tabular">−{formatINR(o.discount_total)}</span></div>}
            <div className="flex justify-between text-sm"><span>Delivery</span><span className="text-green-700 uppercase tracking-widest text-[10px] font-bold">No delivery charges</span></div>
            <div className="flex justify-between items-baseline pt-4 border-t border-neutral-200">
              <span className="font-display uppercase text-sm">Grand Total</span>
              <span className="font-display text-2xl font-bold font-tabular" data-testid="order-grand-total">{formatINR(o.total)}</span>
            </div>
            <div className="text-xs text-neutral-500">
              <div className="uppercase tracking-widest mt-4 mb-1">Ship to</div>
              <div>{o.customer_name}</div>
              <div>{o.address_line1}{o.address_line2 ? `, ${o.address_line2}` : ""}</div>
              <div>{o.city}, {o.state} {o.pincode}</div>
              <div>{o.phone}</div>
            </div>
            {o.transaction_id && (
              <div className="text-xs" data-testid="order-txn-id">
                <div className="uppercase tracking-widest text-neutral-500">Transaction ID</div>
                <div className="font-mono">{o.transaction_id}</div>
              </div>
            )}
            {o.payment_screenshot_url && (
              <div className="text-xs">
                <div className="uppercase tracking-widest text-neutral-500 mb-1">Payment screenshot</div>
                <img src={resolveMedia(o.payment_screenshot_url)} alt="Payment proof" className="w-full max-h-40 object-contain border border-neutral-200" />
              </div>
            )}
            {["placed", "payment_under_validation"].includes(o.status) && (
              <button data-testid="cancel-order-btn" onClick={cancel} className="pl-btn pl-btn-ghost-light w-full text-red-600 border-red-600 hover:bg-red-600 hover:text-white">Cancel Order</button>
            )}
            {(o.status === "placed" && o.payment_status !== "rejected") && (
              <Link to={`/checkout/payment/${o.id}`} className="pl-btn pl-btn-primary w-full" data-testid="complete-payment-btn">Complete Payment</Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default OrderDetail;
