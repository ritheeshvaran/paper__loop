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
  orderDisplayKey,
  orderStatusMessage,
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
  const displayKey = orderDisplayKey(o);
  const statusMsg = orderStatusMessage(o);

  // Build timeline from statuses that have actually happened
  const happened = new Set((o.timeline || []).map((t) => t.status));
  if (o.status === "preparing" || o.status === "approved") {
    happened.add("approved");
    happened.add("preparing");
  }
  if (o.status === "delivered") {
    happened.add("approved");
    happened.add("preparing");
    happened.add("delivered");
  }
  if (o.status === "payment_under_validation" || happened.has("payment_under_validation")) {
    happened.add("placed");
    happened.add("payment_under_validation");
  }
  if (o.status === "placed") happened.add("placed");

  const flowSteps = CUSTOMER_ORDER_FLOW.filter((s) => {
    if (s === "delivered") return happened.has("delivered") || o.status === "delivered";
    if (s === "preparing") return happened.has("preparing") || ["preparing", "packed", "out_for_delivery", "delivered"].includes(o.status);
    if (s === "approved") return happened.has("approved") || ["approved", "preparing", "packed", "out_for_delivery", "delivered"].includes(o.status);
    if (s === "payment_under_validation") {
      return happened.has("payment_under_validation")
        || o.status === "payment_under_validation"
        || ["approved", "preparing", "packed", "out_for_delivery", "delivered"].includes(o.status);
    }
    return true; // placed always shown once order exists
  });

  const currentIdx = (() => {
    const key = displayKey === "payment_rejected" ? "placed" : displayKey;
    const idx = flowSteps.indexOf(key === "approved" && o.status === "preparing" ? "preparing" : key);
    return idx >= 0 ? idx : Math.max(0, flowSteps.length - 1);
  })();

  return (
    <div className="pl-section-light py-16">
      <div className="pl-container">
        <Link to="/account/orders" className="text-xs uppercase tracking-widest text-neutral-500 hover:text-black">← All orders</Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display uppercase text-3xl md:text-4xl" data-testid="order-number">Order {o.order_number}</h1>
          <span className={`text-[11px] uppercase tracking-widest px-2 py-1 ${statusColor(displayKey)}`} data-testid="order-status">
            {displayKey === "delivered" ? "✓ Delivered" : statusLabel(displayKey)}
          </span>
        </div>
        <div className="text-sm text-neutral-500 mt-1">Placed on {formatDate(o.created_at)}</div>
        {o.delivery_date && ["approved", "preparing", "packed", "out_for_delivery", "delivered"].includes(o.status) && (
          <div className="mt-2 text-sm" data-testid="expected-delivery">
            <span className="uppercase tracking-widest text-[10px] text-neutral-500 mr-2">Expected Delivery</span>
            <span className="font-medium">{formatDate(o.delivery_date)}</span>
          </div>
        )}

        {statusMsg && (
          <div
            className={`mt-6 border p-5 text-sm ${
              rejected ? "border-red-200 bg-red-50 text-red-800"
                : displayKey === "delivered" ? "border-green-200 bg-green-50 text-green-900"
                  : "border-neutral-200 bg-neutral-50 text-neutral-700"
            }`}
            data-testid="order-status-message"
          >
            {statusMsg}
          </div>
        )}

        {rejected && (
          <div className="mt-4" data-testid="payment-rejected-banner">
            <Link to={`/checkout/payment/${o.id}`} data-testid="retry-payment-btn" className="pl-btn pl-btn-primary inline-flex">
              Retry Payment →
            </Link>
          </div>
        )}

        {/* Timeline — only statuses that apply */}
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
              <ol className="space-y-6 relative">
                {flowSteps.map((s, i) => {
                  const done = i <= currentIdx;
                  return (
                    <motion.li
                      key={s}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex items-start gap-4"
                    >
                      <div className="mt-0.5">
                        {done ? <CheckCircle2 className="w-6 h-6 text-[color:var(--pl-orange)] bg-white" /> : <Circle className="w-6 h-6 text-neutral-300 bg-white" />}
                      </div>
                      <div>
                        <div className={`font-display uppercase ${done ? "" : "text-neutral-400"}`}>
                          {s === "delivered" ? "✓ Delivered" : statusLabel(s)}
                        </div>
                        {s === "preparing" && o.delivery_date && done && (
                          <div className="text-xs text-neutral-600 mt-0.5">Expected Delivery: {formatDate(o.delivery_date)}</div>
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
            <div className="text-xs">
              <div className="uppercase tracking-widest text-neutral-500">Payment Status</div>
              <div data-testid="payment-status">{paymentStatusLabel(o.payment_status)}</div>
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
            {(o.status === "placed") && (
              <Link to={`/checkout/payment/${o.id}`} className="pl-btn pl-btn-primary w-full" data-testid="complete-payment-btn">
                {rejected ? "Retry Payment" : "Complete Payment"}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default OrderDetail;
