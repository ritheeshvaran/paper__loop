import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { MediaImg } from "@/components/MediaImg";
import { resolveMedia } from "@/lib/media";

const Categories = () => {
  const [items, setItems] = useState([]);
  const [f, setF] = useState({ name: "", slug: "", banner_image_url: "", sort_order: 0 });

  const load = () => api.get("/categories").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!f.name) return;
    try { await api.post("/admin/categories", f); setF({ name: "", slug: "", banner_image_url: "", sort_order: 0 }); toast.success("Category added"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const del = async (id) => {
    if (!window.confirm("Delete this category?")) return;
    try { await api.delete(`/admin/categories/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Reassign products first"); }
  };

  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-neutral-500">Taxonomy</div>
      <h1 className="font-display uppercase text-3xl mt-1 mb-6">Categories</h1>

      <div className="bg-neutral-900 border border-neutral-800 p-5 mb-6">
        <h2 className="font-display uppercase text-lg mb-3">Add category</h2>
        <div className="grid md:grid-cols-4 gap-3">
          <input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
          <input placeholder="Slug (auto)" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} className="bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
          <input placeholder="Banner URL" value={f.banner_image_url} onChange={(e) => setF({ ...f, banner_image_url: e.target.value })} className="bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
          <button onClick={add} className="pl-btn pl-btn-primary"><Plus className="w-4 h-4" /> Add</button>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-neutral-500 text-left">
            <tr><th className="p-4">Name</th><th>Slug</th><th>Banner</th><th></th></tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t border-neutral-800">
                <td className="p-3">{c.name}</td>
                <td className="font-mono text-xs">{c.slug}</td>
                <td>{c.banner_image_url ? <MediaImg src={c.banner_image_url} alt="" className="w-16 h-10 object-cover" /> : "—"}</td>
                <td className="text-right pr-3">
                  <button onClick={() => del(c.id)} className="p-2 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default Categories;
