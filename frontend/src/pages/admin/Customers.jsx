import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";
import { toast } from "sonner";

const Customers = () => {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");

  const load = (query = "") => {
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    api.get(`/admin/customers${params}`).then((r) => setItems(r.data));
  };

  useEffect(() => { load(); }, []);

  const toggleBlock = async (c) => {
    try {
      await api.put(`/admin/customers/${c.id}/block`);
      toast.success(c.is_blocked ? "Account enabled" : "Account disabled");
      load(q);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-neutral-500">Community</div>
      <div className="mt-1 mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display uppercase text-3xl">Customers ({items.length})</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(q)}
          placeholder="Search name, email, phone"
          className="bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm w-64 focus:outline-none focus:border-white"
        />
      </div>
      <div className="bg-neutral-900 border border-neutral-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-neutral-500 text-left">
            <tr>
              <th className="p-4">Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Orders</th>
              <th>Spent</th>
              <th>Joined</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t border-neutral-800">
                <td className="p-3">{c.name}</td>
                <td className="text-neutral-400">{c.email}</td>
                <td className="text-neutral-400">{c.phone}</td>
                <td>{c.order_count}</td>
                <td className="font-tabular">{formatINR(c.total_spent || 0)}</td>
                <td className="text-neutral-500 text-xs">{formatDate(c.created_at)}</td>
                <td className="text-xs uppercase tracking-widest">
                  {c.is_blocked ? <span className="text-red-400">Blocked</span> : <span className="text-green-500">Active</span>}
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => toggleBlock(c)}
                    className="text-[10px] uppercase tracking-widest border border-neutral-600 px-2 py-1 hover:border-white"
                  >
                    {c.is_blocked ? "Enable" : "Disable"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-neutral-500">No customers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default Customers;
