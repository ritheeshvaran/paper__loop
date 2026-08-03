import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { asArray } from "@/lib/lists";
import {
  formatDate,
  formatINR,
  statusLabel,
  statusColor,
  paymentStatusLabel,
  orderDisplayKey,
} from "@/lib/format";
import { resolveMedia } from "@/lib/media";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "placed", label: "Pending Payment" },
  { key: "payment_under_validation", label: "Verification Pending" },
  { key: "preparing", label: "Preparing" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");
  useEffect(() => { api.get("/orders").then((r) => setOrders(asArray(r.data))).catch(() => setOrders([])); }, []);

  const filtered = orders.filter((o) => {
    if (filter === "all") return true;
    if (filter === "preparing") return ["approved", "preparing", "packed", "out_for_delivery"].includes(o.status);
    if (filter === "placed") return o.status === "placed";
    return o.status === filter;
  });

  return (
    <div className="pl-section-light py-16 min-h-screen">
      <div className="pl-container">
        <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Your Orders</div>
        <h1 className="font-display uppercase text-editorial mb-8">Order history.</h1>

        <div className="flex flex-wrap gap-2 mb-8">
          {FILTERS.map((s) => (
            <button
              key={s.key}
              onClick={() => setFilter(s.key)}
              className={`px-4 py-1.5 rounded-full text-[11px] uppercase tracking-widest border ${filter === s.key ? "bg-black text-white border-black" : "border-neutral-300 hover:border-black"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-neutral-500">No orders here yet. <Link to="/shop" className="underline">Start shopping</Link>.</div>
        ) : (
          <ul className="space-y-4">
            {filtered.map((o) => {
              const key = orderDisplayKey(o);
              return (
                <li key={o.id}>
                  <Link to={`/account/orders/${o.id}`} data-testid={`order-row-${o.order_number}`} className="block border border-neutral-200 p-6 hover:border-black transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex -space-x-3">
                        {asArray(o.items).slice(0, 3).map((it, i) => (
                          <img key={i} src={resolveMedia(it.product_image)} alt="" className="w-14 h-14 object-cover border-2 border-white bg-neutral-100" />
                        ))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs text-neutral-500">{o.order_number}</div>
                        <div className="font-display uppercase text-lg mt-1 truncate">
                          {asArray(o.items).map((it) => it.product_name).join(" · ")}
                        </div>
                        <div className="text-xs text-neutral-500 mt-1">
                          {asArray(o.items).length} {asArray(o.items).length > 1 ? "products" : "product"} · Placed {formatDate(o.created_at)}
                        </div>
                        {o.delivery_date && key !== "cancelled" && key !== "placed" && (
                          <div className="text-xs mt-1">Expected Delivery: <span className="font-medium">{formatDate(o.delivery_date)}</span></div>
                        )}
                      </div>
                      <div className="md:text-right space-y-1.5 shrink-0">
                        <div className="font-tabular font-bold">{formatINR(o.total)}</div>
                        <div>
                          <span className={`inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 ${statusColor(key)}`} data-testid="order-status">
                            {key === "delivered" ? "✓ Delivered" : statusLabel(key)}
                          </span>
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-neutral-500">
                          Payment · {paymentStatusLabel(o.payment_status)}
                        </div>
                        <div className="text-[11px] uppercase tracking-widest text-black underline">View Details</div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
export default Orders;
