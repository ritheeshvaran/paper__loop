import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, PieChart, Pie, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from "recharts";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { resolveMedia } from "@/lib/media";

const COLORS = ["#FF6A00", "#0A0A0A", "#8A8A85", "#E5A400", "#1E8E5A", "#6E56CF", "#E5383B", "#3B82F6"];

const StatCard = ({ label, value, sub, delay = 0 }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    className="bg-neutral-900 border border-neutral-800 p-5">
    <div className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</div>
    <div className="mt-2 font-display text-3xl font-tabular">{value}</div>
    {sub && <div className="text-xs text-neutral-500 mt-1">{sub}</div>}
  </motion.div>
);

const Analytics = () => {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/admin/analytics").then((r) => setData(r.data)); }, []);

  if (!data) return <div className="text-neutral-500">Loading…</div>;
  const revSeries = data.revenue_series || [];
  const cats = data.category_breakdown || [];

  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-neutral-500">Insights</div>
      <h1 className="font-display uppercase text-3xl mt-1 mb-6">Analytics</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Revenue (all)" value={formatINR(data.total_revenue)} sub="Non-cancelled" delay={0.05} />
        <StatCard label="Revenue (delivered)" value={formatINR(data.delivered_revenue)} delay={0.1} />
        <StatCard label="Newsletter" value={data.newsletter_count} sub="subscribers" delay={0.15} />
        <StatCard label="Customers" value={data.customer_count} delay={0.2} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 p-5">
          <h2 className="font-display uppercase text-xl mb-4">Revenue · Last 14 days</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revSeries}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF6A00" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#FF6A00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#2A2A2A" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#8A8A85", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: "#8A8A85", fontSize: 10 }} width={40} />
                <Tooltip contentStyle={{ background: "#0A0A0A", border: "1px solid #2A2A2A", color: "#fff" }} formatter={(v) => formatINR(v)} />
                <Area type="monotone" dataKey="revenue" stroke="#FF6A00" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 p-5">
          <h2 className="font-display uppercase text-xl mb-4">Order Status</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Pending", value: data.order_counts.pending },
                    { name: "In-flight", value: data.order_counts.approved },
                    { name: "Delivered", value: data.order_counts.delivered },
                    { name: "Cancelled", value: data.order_counts.cancelled },
                  ]}
                  innerRadius={40} outerRadius={80} paddingAngle={2} dataKey="value"
                >
                  {[0, 1, 2, 3].map((i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#0A0A0A", border: "1px solid #2A2A2A", color: "#fff" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            {["Pending", "In-flight", "Delivered", "Cancelled"].map((l, i) => (
              <div key={l} className="flex items-center gap-2">
                <span className="w-3 h-3" style={{ background: COLORS[i] }} />
                <span className="text-neutral-400">{l}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 p-5">
          <h2 className="font-display uppercase text-xl mb-4">Top Products</h2>
          <ul className="divide-y divide-neutral-800">
            {(data.top_products || []).map((p, i) => (
              <li key={p.id} className="py-3 flex items-center gap-3">
                <span className="w-6 text-neutral-500 font-mono text-sm">{String(i + 1).padStart(2, "0")}</span>
                <img src={resolveMedia(p.images?.[0])} alt="" className="w-10 h-12 object-cover bg-neutral-800" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{p.name}</div>
                </div>
                <div className="font-tabular text-sm">{p.sold} sold</div>
                <div className="font-tabular text-sm text-neutral-400">{formatINR(p.price)}</div>
              </li>
            ))}
            {!(data.top_products || []).length && <li className="text-sm text-neutral-500 py-2">Data appears after orders start rolling in.</li>}
          </ul>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 p-5">
          <h2 className="font-display uppercase text-xl mb-4">By Category</h2>
          <ul className="space-y-2">
            {cats.length === 0 && <li className="text-sm text-neutral-500">No sales yet.</li>}
            {cats.map((c, i) => {
              const max = Math.max(...cats.map((x) => x.value));
              const pct = max > 0 ? (c.value / max) * 100 : 0;
              return (
                <li key={c.name}>
                  <div className="flex justify-between text-xs uppercase tracking-widest text-neutral-400 mb-1">
                    <span>{c.name}</span><span className="font-tabular text-neutral-200">{c.value}</span>
                  </div>
                  <div className="h-1.5 bg-neutral-800">
                    <div className="h-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};
export default Analytics;
