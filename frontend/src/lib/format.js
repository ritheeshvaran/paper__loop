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

/** Customer-facing order status labels (canonical purchase flow). */
export const statusLabel = (s) => ({
  placed: "Awaiting Payment",
  payment_under_validation: "Payment Verification Pending",
  approved: "Order Confirmed",
  preparing: "Order Confirmed",
  packed: "Order Confirmed",
  out_for_delivery: "Order Confirmed",
  delivered: "Delivered",
  cancelled: "Cancelled",
}[s] || s);

export const statusColor = (s) => ({
  placed: "bg-neutral-200 text-neutral-900",
  payment_under_validation: "bg-amber-100 text-amber-900",
  approved: "bg-green-100 text-green-900",
  preparing: "bg-green-100 text-green-900",
  packed: "bg-green-100 text-green-900",
  out_for_delivery: "bg-green-100 text-green-900",
  delivered: "bg-green-100 text-green-900",
  cancelled: "bg-red-100 text-red-900",
}[s] || "bg-neutral-200 text-neutral-900");

/** Separate payment status (shown alongside order status). */
export const paymentStatusLabel = (s) => ({
  pending: "Awaiting Payment",
  under_validation: "Payment Verification Pending",
  verified: "Payment Approved",
  rejected: "Payment Rejected",
}[s] || s || "Awaiting Payment");

export const paymentStatusColor = (s) => ({
  pending: "bg-neutral-200 text-neutral-900",
  under_validation: "bg-amber-100 text-amber-900",
  verified: "bg-green-100 text-green-900",
  rejected: "bg-red-100 text-red-900",
}[s] || "bg-neutral-200 text-neutral-900");

/** Simplified customer timeline — no shipment/map tracking. */
export const CUSTOMER_ORDER_FLOW = [
  "placed",
  "payment_under_validation",
  "approved",
];
