export const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch (e) {
    return iso;
  }
};

/**
 * Single customer-facing status key derived from order + payment fields.
 * Prevents duplicate badges that previously both said "Payment Verification Pending".
 */
export const orderDisplayKey = (o) => {
  if (!o) return "placed";
  if (o.status === "cancelled") return "cancelled";
  if (o.payment_status === "rejected") return "payment_rejected";
  if (o.status === "delivered") return "delivered";
  if (["preparing", "packed", "out_for_delivery"].includes(o.status)) return "preparing";
  if (o.status === "approved") return "approved";
  if (o.status === "payment_under_validation") return "payment_under_validation";
  return "placed";
};

/** Customer-facing order status labels (canonical purchase flow). */
export const statusLabel = (s) => ({
  placed: "Pending Payment",
  payment_under_validation: "Payment Verification Pending",
  approved: "Payment Approved",
  preparing: "Preparing Order",
  packed: "Preparing Order",
  out_for_delivery: "Preparing Order",
  delivered: "Delivered",
  cancelled: "Cancelled",
  payment_rejected: "Payment Rejected",
}[s] || s);

export const statusColor = (s) => ({
  placed: "bg-neutral-200 text-neutral-900",
  payment_under_validation: "bg-amber-100 text-amber-900",
  approved: "bg-green-100 text-green-900",
  preparing: "bg-sky-100 text-sky-900",
  packed: "bg-sky-100 text-sky-900",
  out_for_delivery: "bg-sky-100 text-sky-900",
  delivered: "bg-green-100 text-green-900",
  cancelled: "bg-red-100 text-red-900",
  payment_rejected: "bg-red-100 text-red-900",
}[s] || "bg-neutral-200 text-neutral-900");

/** Payment status labels (admin / secondary use — not shown next to duplicate order badge). */
export const paymentStatusLabel = (s) => ({
  pending: "Pending Payment",
  under_validation: "Payment Verification Pending",
  verified: "Payment Approved",
  rejected: "Payment Rejected",
}[s] || s || "Pending Payment");

export const paymentStatusColor = (s) => ({
  pending: "bg-neutral-200 text-neutral-900",
  under_validation: "bg-amber-100 text-amber-900",
  verified: "bg-green-100 text-green-900",
  rejected: "bg-red-100 text-red-900",
}[s] || "bg-neutral-200 text-neutral-900");

/** Customer timeline steps that have actually progressed. */
export const CUSTOMER_ORDER_FLOW = [
  "placed",
  "payment_under_validation",
  "approved",
  "preparing",
  "delivered",
];

/** Status messages shown on order detail. */
export const orderStatusMessage = (o) => {
  const key = orderDisplayKey(o);
  return ({
    placed: "Complete payment to confirm your order.",
    payment_under_validation: "Payment submitted successfully. Waiting for verification.",
    approved: "Payment verified. Your order is now being prepared.",
    preparing: "Payment verified. Your order is now being prepared.",
    delivered: "Order delivered. Thank you for shopping with Paper & Loop.",
    payment_rejected: "Payment could not be verified. Please contact support.",
    cancelled: "This order was cancelled.",
  })[key] || "";
};
