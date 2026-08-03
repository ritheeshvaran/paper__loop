import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { asArray } from "@/lib/lists";
import { formatINR, formatDate, statusLabel, statusColor } from "@/lib/format";
import { resolveMedia } from "@/lib/media";

const StatCard = ({ label, value, sub, delay = 0 }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    className="bg-neutral-900 border border-neutral-800 p-5">
    <div className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</div>
    <div className="mt-2 font-display text-3xl font-tabular">{value}</div>
    {sub && <div className="text-xs text-neutral-500 mt-1">{sub}</div>}
  </motion.div>
);

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    api.get("/admin/analytics").then((r) => setData(r.data));
    api.get("/admin/orders").then((r) => setOrders(asArray(r.data).slice(0, 8))).catch(() => setOrders([]));
  }, []);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-neutral-500">Overview</div>
          <h1 className="font-display uppercase text-3xl mt-1">Dashboard</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Revenue" value={data ? formatINR(data.total_revenue) : "—"} sub="All non-cancelled orders" delay={0.05} />
        <StatCard label="Orders" value={data?.order_counts?.total ?? "—"} sub={`${data?.order_counts?.pending ?? 0} pending`} delay={0.1} />
        <StatCard label="Products" value={data?.product_count ?? "—"} delay={0.15} />
        <StatCard label="Customers" value={data?.customer_count ?? "—"} delay={0.2} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display uppercase text-xl">Recent Orders</h2>
            <Link to="/admin/orders" className="text-xs uppercase tracking-widest text-neutral-400 hover:text-[color:var(--pl-orange)]">All →</Link>
          </div>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-neutral-500 text-left">
              <tr><th className="py-2">Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-neutral-800 hover:bg-neutral-800/50">
                  <td className="py-3"><Link to={`/admin/orders/${o.id}`} className="font-mono text-xs">{o.order_number}</Link></td>
                  <td>{o.customer_name}</td>
                  <td className="font-tabular">{formatINR(o.total)}</td>
                  <td><span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 ${statusColor(o.status)}`}>{statusLabel(o.status)}</span></td>
                  <td className="text-neutral-400">{formatDate(o.created_at)}</td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-neutral-500">No orders yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 p-5">
          <h2 className="font-display uppercase text-xl mb-4">Top Products</h2>
          <ul className="space-y-3">
            {(data?.top_products || []).map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <img src={resolveMedia(p.images?.[0])} alt="" className="w-10 h-12 object-cover bg-neutral-800" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{p.name}</div>
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500">{p.sold} sold</div>
                </div>
                <div className="font-tabular text-sm">{formatINR(p.price)}</div>
              </li>
            ))}
            {(data?.top_products || []).length === 0 && <li className="text-sm text-neutral-500">Sales data will appear here.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
