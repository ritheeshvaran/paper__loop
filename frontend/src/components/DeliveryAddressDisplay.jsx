import React from "react";
import { deliveryBadge, formatDeliveryAddress } from "@/lib/delivery";

/** Read-only delivery address block for checkout review, payment, and order pages. */
export function DeliveryAddressDisplay({ order, className = "", testId = "delivery-address", dark = false }) {
  if (!order) return null;
  const badge = deliveryBadge(order);
  const { lines } = formatDeliveryAddress(order);
  const textCls = dark ? "text-neutral-300" : "text-neutral-700";
  const labelCls = dark ? "text-neutral-500" : "text-neutral-500";
  const badgeCls = dark
    ? "bg-neutral-800 border-neutral-700 text-neutral-300"
    : "bg-neutral-100 border-neutral-200";

  return (
    <div className={className} data-testid={testId}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] uppercase tracking-widest ${labelCls}`}>Delivery Address</span>
        <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 border ${badgeCls}`}>
          {badge.emoji} {badge.label}
        </span>
      </div>
      <div className={`text-sm space-y-0.5 ${textCls}`}>
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}

/** Compact badge for order lists (admin). */
export function DeliveryTypeBadge({ order, dark = false }) {
  const badge = deliveryBadge(order);
  const cls = dark
    ? "inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 bg-neutral-800 border border-neutral-700 text-neutral-300"
    : "inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 bg-neutral-100 border border-neutral-200";
  return (
    <span className={cls} data-testid="delivery-type-badge">
      {badge.emoji} {badge.label}
    </span>
  );
}
