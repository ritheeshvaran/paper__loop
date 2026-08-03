import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import {
  formatINR,
  formatDate,
  statusLabel,
  statusColor,
  paymentStatusLabel,
  paymentStatusColor,
  orderDisplayKey,
} from "@/lib/format";
import { MediaImg } from "@/components/MediaImg";
import { resolveMedia } from "@/lib/media";
import { DeliveryAddressDisplay, DeliveryTypeBadge } from "@/components/DeliveryAddressDisplay";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const OrderDetail = () => {
  const { id } = useParams();
  const [o, setO] = useState(null);
  const [lightbox, setLightbox] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/orders/${id}`).then((r) => {
    setO(r.data);
    if (r.data?.delivery_date) setDeliveryDate(String(r.data.delivery_date).slice(0, 10));
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const approvePayment = async () => {
    if (!deliveryDate) {
      toast.error("Choose an expected delivery date");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/admin/orders/${id}/approve-payment`, {
        note: "Payment verified. Your order is now being prepared.",
        delivery_date: new Date(`${deliveryDate}T12:00:00`).toISOString(),
      });
      toast.success("Payment approved");
      setApproveOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const rejectPayment = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/orders/${id}/reject-payment`, {
        note: "Payment could not be verified. Please contact support.",
      });
      toast.success("Payment declined");
      setRejectOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const markDelivered = async () => {
    setBusy(true);
    try {
      await api.put(`/admin/orders/${id}/status`, { status: "delivered", note: "Order delivered" });
      toast.success("Marked delivered");
      setDeliverOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (!o) return <div>Loading…</div>;

  const displayKey = orderDisplayKey(o);
  const awaitingPayment = o.status === "payment_under_validation"
    || (o.status === "placed" && o.payment_status === "under_validation");
  const canDeliver = ["preparing", "approved", "packed", "out_for_delivery"].includes(o.status);
  const proofUrl = o.payment_screenshot_url ? resolveMedia(o.payment_screenshot_url) : "";
  const paymentTime = o.payment_submitted_at || (o.timeline || []).find((t) => t.status === "payment_under_validation")?.at;

  return (
    <div>
      <Link to="/admin/orders" className="text-xs uppercase tracking-widest text-neutral-500 hover:text-white">← All orders</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display uppercase text-3xl">{o.order_number}</h1>
        <DeliveryTypeBadge order={o} dark />
        <span className={`text-[11px] uppercase tracking-widest px-2 py-1 ${statusColor(displayKey)}`} data-testid="admin-order-status">
          {statusLabel(displayKey)}
        </span>
        <span className={`text-[11px] uppercase tracking-widest px-2 py-1 ${paymentStatusColor(o.payment_status)}`} data-testid="admin-payment-status">
          {paymentStatusLabel(o.payment_status)}
        </span>
      </div>
      <div className="text-sm text-neutral-500">{formatDate(o.created_at)}</div>

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 p-5">
            <h2 className="font-display uppercase text-lg mb-4">Items</h2>
            <ul className="divide-y divide-neutral-800">
              {o.items.map((it) => (
                <li key={it.product_id} className="py-3 flex gap-4">
                  <MediaImg src={it.product_image} alt="" className="w-14 h-16 object-cover bg-neutral-800" />
                  <div className="flex-1">
                    <div className="text-sm">{it.product_name}</div>
                    <div className="text-xs text-neutral-500">Qty {it.quantity} × {formatINR(it.final_price)}</div>
                  </div>
                  <div className="font-tabular">{formatINR(it.line_total)}</div>
                </li>
              ))}
            </ul>
          </div>

          {(o.transaction_id || proofUrl) && (
            <div className="bg-neutral-900 border border-neutral-800 p-5" data-testid="admin-payment-proof">
              <h2 className="font-display uppercase text-lg mb-4">Payment Verification</h2>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500">Transaction ID</div>
                  <div className="font-mono mt-1" data-testid="admin-txn-id">{o.transaction_id || "—"}</div>
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500 mt-4">Payment time</div>
                  <div className="mt-1" data-testid="admin-payment-time">{paymentTime ? formatDate(paymentTime) : "—"}</div>
                </div>
                {proofUrl && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">Screenshot</div>
                    <button type="button" onClick={() => setLightbox(true)} className="block w-full" data-testid="admin-proof-thumb">
                      <img src={proofUrl} alt="Payment proof" className="w-full max-h-72 object-contain bg-neutral-800 border border-neutral-700" />
                      <div className="text-[10px] uppercase tracking-widest text-neutral-400 mt-2">Click to enlarge</div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-neutral-900 border border-neutral-800 p-5">
            <h2 className="font-display uppercase text-lg mb-4">Timeline</h2>
            <ol className="space-y-2">
              {(o.timeline || []).map((t, i) => (
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
            {o.delivery_date && (
              <div className="pt-2 border-t border-neutral-800 text-sm">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Expected Delivery</div>
                <div>{formatDate(o.delivery_date)}</div>
              </div>
            )}
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5">
            <h2 className="font-display uppercase text-lg mb-3">Customer &amp; Delivery</h2>
            <div className="text-sm space-y-3">
              <div>{o.customer_name}</div>
              <div className="text-neutral-400">{o.customer_email}</div>
              <DeliveryAddressDisplay order={o} dark testId="admin-delivery-address" />
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5 space-y-3">
            <h2 className="font-display uppercase text-lg">Actions</h2>
            {awaitingPayment && (
              <>
                <button data-testid="admin-approve-payment" onClick={() => setApproveOpen(true)} className="pl-btn pl-btn-primary w-full">
                  Approve
                </button>
                <button data-testid="admin-reject-payment" onClick={() => setRejectOpen(true)} className="pl-btn pl-btn-ghost-dark w-full">
                  Decline
                </button>
              </>
            )}
            {canDeliver && (
              <button data-testid="admin-mark-delivered" onClick={() => setDeliverOpen(true)} className="pl-btn pl-btn-primary w-full">
                Mark Delivered
              </button>
            )}
            {o.status !== "cancelled" && o.status !== "delivered" && !awaitingPayment && (
              <button
                onClick={async () => {
                  try {
                    await api.put(`/admin/orders/${id}/status`, { status: "cancelled", note: "Cancelled by admin" });
                    toast.success("Order cancelled");
                    load();
                  } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
                }}
                className="pl-btn pl-btn-ghost-dark w-full text-red-500 border-red-500 hover:bg-red-500 hover:text-white"
              >
                Cancel Order
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Screenshot lightbox */}
      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent className="max-w-3xl bg-neutral-950 border-neutral-800 text-white p-4">
          <DialogHeader>
            <DialogTitle className="font-display uppercase">Payment screenshot</DialogTitle>
          </DialogHeader>
          {proofUrl && (
            <img src={proofUrl} alt="Payment proof full" className="w-full max-h-[75vh] object-contain" data-testid="admin-proof-full" />
          )}
        </DialogContent>
      </Dialog>

      {/* Approve modal */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white">
          <DialogHeader>
            <DialogTitle className="font-display uppercase">Approve payment</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Confirm payment verification and set the expected delivery date. Approval cannot be saved without a date.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">Expected Delivery Date *</label>
            <input
              data-testid="admin-delivery-date"
              type="date"
              required
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full mt-1 bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <DialogFooter className="gap-2">
            <button type="button" className="pl-btn pl-btn-ghost-dark" onClick={() => setApproveOpen(false)}>Cancel</button>
            <button type="button" data-testid="admin-confirm-approve" disabled={busy || !deliveryDate} className="pl-btn pl-btn-primary disabled:opacity-50" onClick={approvePayment}>
              {busy ? "Saving…" : "Confirm Approve"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline modal */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white">
          <DialogHeader>
            <DialogTitle className="font-display uppercase">Decline payment</DialogTitle>
            <DialogDescription className="text-neutral-400">
              The customer will be told payment could not be verified and can retry or contact support.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button type="button" className="pl-btn pl-btn-ghost-dark" onClick={() => setRejectOpen(false)}>Cancel</button>
            <button type="button" data-testid="admin-confirm-reject" disabled={busy} className="pl-btn pl-btn-primary bg-red-600 hover:bg-red-500" onClick={rejectPayment}>
              {busy ? "Saving…" : "Confirm Decline"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivered modal */}
      <Dialog open={deliverOpen} onOpenChange={setDeliverOpen}>
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white">
          <DialogHeader>
            <DialogTitle className="font-display uppercase">Mark delivered</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Confirm this order has been delivered to the customer. No further actions will be available.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button type="button" className="pl-btn pl-btn-ghost-dark" onClick={() => setDeliverOpen(false)}>Cancel</button>
            <button type="button" data-testid="admin-confirm-delivered" disabled={busy} className="pl-btn pl-btn-primary" onClick={markDelivered}>
              {busy ? "Saving…" : "Confirm Delivered"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default OrderDetail;
