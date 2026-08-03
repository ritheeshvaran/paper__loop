import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Copy, CheckCircle2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { MediaImg } from "@/components/MediaImg";
import { resolveMedia } from "@/lib/media";
import { DeliveryAddressDisplay } from "@/components/DeliveryAddressDisplay";
import { toast } from "sonner";

/** Canonical UPI payment details — only this QR/UPI is used at checkout. */
export const PAYMENT_UPI_ID = "ritheeshvaran2007@okhdfcbank";
export const PAYMENT_QR_URL = "/uploads/upi-qr-ritheesh.png";

const Payment = ({ settings }) => {
  const { id } = useParams();
  const nav = useNavigate();
  const [order, setOrder] = useState(null);
  const [txn, setTxn] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const upiId = PAYMENT_UPI_ID;
  const qrUrl = resolveMedia(PAYMENT_QR_URL) || PAYMENT_QR_URL;

  useEffect(() => {
    api.get(`/orders/${id}`).then((r) => {
      setOrder(r.data);
      if (r.data?.transaction_id) setTxn(r.data.transaction_id);
      if (r.data?.payment_screenshot_url) setScreenshotUrl(r.data.payment_screenshot_url);
    });
  }, [id]);

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/orders/${id}/upload-payment-proof`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setScreenshotUrl(data.url);
      toast.success("Screenshot uploaded");
    } catch {
      toast.error("Couldn't upload screenshot");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (txn.trim().length < 6) return toast.error("Enter a valid transaction ID");
    if (!screenshotUrl) return toast.error("Payment screenshot is required");
    setSubmitting(true);
    try {
      await api.post(`/orders/${id}/submit-payment`, {
        transaction_id: txn.trim(),
        payment_screenshot_url: screenshotUrl,
      });
      nav(`/checkout/confirmation/${id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't submit payment");
    } finally {
      setSubmitting(false);
    }
  };

  if (!order) return <div className="min-h-[60vh] flex items-center justify-center">Loading…</div>;

  return (
    <div className="pl-section-light py-16">
      <div className="pl-container max-w-3xl">
        <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Step 2 of 3 · Payment</div>
        <h1 className="font-display uppercase text-editorial mb-2">Scan &amp; Pay.</h1>
        <p className="text-neutral-600">
          Pay <strong>{formatINR(order.total)}</strong> via any UPI app, then enter your transaction ID below.
          Your order stays <strong>Payment Verification Pending</strong> until we approve it.
        </p>
        {settings?.upi_id && settings.upi_id !== upiId && (
          <p className="sr-only">Using canonical UPI {upiId}</p>
        )}

        <div className="mt-8 border border-neutral-200 p-6" data-testid="payment-delivery-review">
          <DeliveryAddressDisplay order={order} />
        </div>

        <div className="mt-10 grid md:grid-cols-2 gap-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="border border-neutral-200 p-6 text-center">
            <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-4">Scan with any UPI app</div>
            <img
              data-testid="gpay-qr"
              src={qrUrl}
              alt="UPI QR — Ritheeshvaran Ilangovan"
              className="w-full max-w-xs mx-auto object-contain bg-white"
            />
            <button
              type="button"
              data-testid="copy-upi-id"
              onClick={() => { navigator.clipboard.writeText(upiId); toast.success("UPI ID copied"); }}
              className="mt-4 inline-flex items-center gap-2 text-sm font-mono border border-neutral-300 px-3 py-2 hover:border-black"
            >
              <Copy className="w-4 h-4" /> {upiId}
            </button>
            <div className="mt-6 text-xs text-neutral-500">
              Amount: <span className="font-tabular font-bold text-black">{formatINR(order.total)}</span>
            </div>
          </motion.div>

          <form onSubmit={submit} className="border border-neutral-200 p-6">
            <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-4">After Payment</div>
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">UPI Transaction ID *</label>
            <input
              data-testid="txn-input"
              required
              value={txn}
              onChange={(e) => setTxn(e.target.value)}
              placeholder="e.g. 442231000123"
              className="w-full mt-1 border-b border-neutral-300 focus:border-black bg-transparent py-2 font-mono focus:outline-none"
            />

            <label className="mt-6 block text-[10px] uppercase tracking-widest text-neutral-500">Payment screenshot *</label>
            <label className="mt-2 flex items-center justify-center gap-2 border border-dashed border-neutral-300 px-3 py-6 cursor-pointer hover:border-black text-sm">
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading…" : screenshotUrl ? "Replace screenshot" : "Upload screenshot"}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onUpload} disabled={uploading} data-testid="payment-screenshot-input" required={!screenshotUrl} />
            </label>
            {screenshotUrl && (
              <MediaImg src={screenshotUrl} alt="Payment proof" className="mt-3 w-full max-h-40 object-contain border border-neutral-200" data-testid="payment-screenshot-preview" />
            )}
            {!screenshotUrl && (
              <p className="text-xs text-red-600 mt-2" data-testid="screenshot-required-hint">Screenshot is required before submitting.</p>
            )}

            <p className="text-xs text-neutral-500 mt-3 flex gap-2">
              <CheckCircle2 className="w-4 h-4 text-[color:var(--pl-orange)] shrink-0" />
              Both screenshot and transaction ID are required. Admin verifies payment before your order is prepared.
            </p>
            <button data-testid="submit-payment" disabled={submitting || !screenshotUrl || txn.trim().length < 6} className="pl-btn pl-btn-primary w-full mt-6 disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? "Submitting…" : "Submit Payment"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
export default Payment;
