import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { asArray } from "@/lib/lists";
import { formatDate, formatINR, statusLabel, statusColor, paymentStatusLabel, paymentStatusColor } from "@/lib/format";

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");
  useEffect(() => { api.get("/orders").then((r) => setOrders(asArray(r.data))).catch(() => setOrders([])); }, []);
  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  return (
    <div className="pl-section-light py-16 min-h-screen">
      <div className="pl-container">
        <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Your Orders</div>
        <h1 className="font-display uppercase text-editorial mb-8">Track everything.</h1>

        <div className="flex flex-wrap gap-2 mb-8">
          {["all", "placed", "payment_under_validation", "approved", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-1.5 rounded-full text-[11px] uppercase tracking-widest border ${filter === s ? "bg-black text-white border-black" : "border-neutral-300 hover:border-black"}`}
            >
              {s === "all" ? "All" : statusLabel(s)}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-neutral-500">No orders here yet. <Link to="/shop" className="underline">Start shopping</Link>.</div>
        ) : (
          <ul className="space-y-4">
            {filtered.map((o) => (
              <li key={o.id}>
                <Link to={`/account/orders/${o.id}`} data-testid={`order-row-${o.order_number}`} className="block border border-neutral-200 p-6 hover:border-black transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex -space-x-3">
                      {asArray(o.items).slice(0, 3).map((it, i) => (
                        <img key={i} src={it.product_image} alt="" className="w-14 h-14 object-cover border-2 border-white bg-neutral-100" />
                      ))}
                    </div>
                    <div className="flex-1">
                      <div className="font-mono text-xs text-neutral-500">{o.order_number}</div>
                      <div className="font-display uppercase text-lg mt-1">{asArray(o.items).length} {asArray(o.items).length > 1 ? "items" : "item"}</div>
                      <div className="text-xs text-neutral-500">Placed {formatDate(o.created_at)}</div>
                    </div>
                    <div className="md:text-right space-y-1">
                      <div className="font-tabular font-bold">{formatINR(o.total)}</div>
                      <span className={`inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 ${statusColor(o.status)}`}>{statusLabel(o.status)}</span>
                      <span className={`inline-block ml-1 text-[10px] uppercase tracking-widest px-2 py-0.5 ${paymentStatusColor(o.payment_status)}`}>{paymentStatusLabel(o.payment_status)}</span>
                      {o.transaction_id && <div className="text-[10px] font-mono text-neutral-500">Txn {o.transaction_id}</div>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
export default Orders;
