/** Delivery location helpers for checkout and order display. */

export const DELIVERY_WOXSEN = "woxsen_university";
export const DELIVERY_OUTSIDE = "outside_woxsen";

export const WOXSEN_TOWERS = [
  "Tower A",
  "Tower B",
  "Tower C",
  "Tower D",
  "Hostel Block 1",
  "Hostel Block 2",
  "Hostel Block 3",
];

export function isWoxsenDelivery(order) {
  return order?.delivery_type === DELIVERY_WOXSEN;
}

export function deliveryBadge(order) {
  if (isWoxsenDelivery(order)) {
    return { emoji: "🏫", label: "Woxsen University" };
  }
  return { emoji: "🏠", label: "Outside Delivery" };
}

/** Formatted delivery address for review screens and order detail. */
export function formatDeliveryAddress(order) {
  if (!order) return { lines: [], short: "" };

  if (isWoxsenDelivery(order)) {
    const lines = [
      "🏫 Woxsen University",
      `Tower: ${order.tower || "—"}`,
      `Room: ${order.room_number || "—"}`,
    ];
    if (order.phone) lines.push(`Phone: ${order.phone}`);
    if (order.customer_email) lines.push(order.customer_email);
    if (order.delivery_instructions) {
      lines.push(`Instructions: ${order.delivery_instructions}`);
    }
    return {
      lines,
      short: `Woxsen University · ${order.tower || "—"}, Room ${order.room_number || "—"}`,
    };
  }

  const parts = [
    order.address_line1,
    order.address_line2,
    order.address_line3,
  ].filter(Boolean);
  const cityLine = [order.city, order.state, order.pincode].filter(Boolean).join(", ");
  const lines = [
    order.customer_name,
    parts.length ? parts.join(", ") : null,
    order.landmark ? `Landmark: ${order.landmark}` : null,
    cityLine || null,
    order.country || "India",
    order.phone ? `Phone: ${order.phone}` : null,
  ].filter(Boolean);

  return {
    lines,
    short: parts[0] ? `${parts[0]}, ${cityLine}` : cityLine || order.customer_name || "",
  };
}

export const CHECKOUT_DELIVERY_KEY = "pl_checkout_delivery_type";
