import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, API } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { resolveMedia } from "@/lib/media";
import { normalizeProductStatus, parseStockInput, statusLabel } from "@/lib/productStatus";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, Upload } from "lucide-react";

const empty = {
  name: "", slug: "", category_slug: "anime", description: "",
  price: 599, discount_percent: 0, stock_quantity: 20,
  status: "ACTIVE",
  images: [""], lifestyle_image: "",
  material: "Premium 250gsm matte paper", size: "A3 (11.7 x 16.5 in)", finish: "Matte",
  is_featured: false, is_trending: false, is_best_seller: false, is_new: true, is_limited: false,
  visibility: "published",
};

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "SOLD_OUT", label: "Sold Out" },
  { value: "COMING_SOON", label: "Coming Soon" },
];

const Products = () => {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const fileRef = useRef(null);
  const lifestyleRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (file, target = "images") => {
    const fd = new FormData(); fd.append("file", file);
    setUploading(true);
    try {
      const token = localStorage.getItem("pl_token");
      const res = await fetch(`${API}/admin/upload?folder=products`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      if (target === "lifestyle") setForm((f) => ({ ...f, lifestyle_image: url }));
      else setForm((f) => ({ ...f, images: [...f.images.filter(Boolean), url] }));
      toast.success("Uploaded");
    } catch (e) { toast.error("Upload failed"); }
    finally { setUploading(false); }
  };

  const load = () => api.get("/admin/products").then((r) => setItems(r.data));
  useEffect(() => { load(); api.get("/categories").then((r) => setCats(r.data)); }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return items;
    return items.filter((p) => normalizeProductStatus(p) === statusFilter);
  }, [items, statusFilter]);

  const openNew = () => { setEditing("new"); setForm({ ...empty, category_slug: cats[0]?.slug || "anime" }); };
  const openEdit = (p) => {
    setEditing(p.id);
    setForm({
      name: p.name, slug: p.slug, category_slug: p.category_slug, description: p.description,
      price: p.price, discount_percent: p.discount_percent || 0,
      stock_quantity: Number.isFinite(Number(p.stock_quantity)) ? Math.max(0, Math.trunc(Number(p.stock_quantity))) : 0,
      status: normalizeProductStatus(p),
      images: p.images?.length ? p.images : [""], lifestyle_image: p.lifestyle_image || "",
      material: p.material, size: p.size, finish: p.finish,
      is_featured: p.is_featured, is_trending: p.is_trending, is_best_seller: p.is_best_seller,
      is_new: p.is_new, is_limited: p.is_limited, visibility: p.visibility,
    });
  };

  const setNumberField = (k, raw) => {
    if (raw === "") {
      setForm((f) => ({ ...f, [k]: "" }));
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (k === "stock_quantity") {
      setForm((f) => ({ ...f, [k]: Math.max(0, Math.trunc(n)) }));
      return;
    }
    setForm((f) => ({ ...f, [k]: n }));
  };

  const save = async () => {
    const stock = parseStockInput(form.stock_quantity);
    if (stock === null) {
      toast.error("Stock must be a whole number 0 or greater");
      return;
    }
    const payload = {
      ...form,
      stock_quantity: stock,
      status: normalizeProductStatus(form),
      images: form.images.filter(Boolean),
    };
    try {
      if (editing === "new") { await api.post("/admin/products", payload); toast.success("Product created"); }
      else { await api.put(`/admin/products/${editing}`, payload); toast.success("Product updated"); }
      setEditing(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const changeStatus = async (id, status) => {
    const prev = items;
    setItems((list) => list.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      await api.patch(`/admin/products/${id}/status`, { status });
      toast.success(`Status set to ${statusLabel(status)}`);
    } catch (e) {
      setItems(prev);
      toast.error(e.response?.data?.detail || "Could not update status");
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await api.delete(`/admin/products/${id}`); toast.success("Deleted"); load();
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-neutral-500">Catalog</div>
          <h1 className="font-display uppercase text-3xl mt-1">Products ({filtered.length})</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            data-testid="admin-products-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm focus:outline-none focus:border-neutral-600"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <button data-testid="admin-new-product" onClick={openNew} className="pl-btn pl-btn-primary"><Plus className="w-4 h-4" /> New Product</button>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-neutral-500 text-left">
            <tr><th className="p-4">Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Flags</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-neutral-800 hover:bg-neutral-800/50">
                <td className="p-3 flex items-center gap-3">
                  <img src={resolveMedia(p.images?.[0])} alt="" className="w-10 h-12 object-cover bg-neutral-800" />
                  <div>
                    <div>{p.name}</div>
                    <div className="text-xs text-neutral-500 font-mono">{p.slug}</div>
                  </div>
                </td>
                <td className="text-neutral-400 uppercase text-xs">{p.category_slug}</td>
                <td className="font-tabular">
                  {formatINR(p.final_price)}
                  {p.discount_percent > 0 && <span className="ml-2 text-xs text-[color:var(--pl-orange)]">−{p.discount_percent}%</span>}
                </td>
                <td className={p.stock_quantity < 5 ? "text-amber-500" : "text-neutral-300"}>{p.stock_quantity}</td>
                <td>
                  <select
                    data-testid={`admin-product-status-${p.slug}`}
                    value={normalizeProductStatus(p)}
                    onChange={(e) => changeStatus(p.id, e.target.value)}
                    className="bg-neutral-950 border border-neutral-800 px-2 py-1.5 text-xs uppercase tracking-widest focus:outline-none focus:border-neutral-600"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="SOLD_OUT">Sold Out</option>
                    <option value="COMING_SOON">Coming Soon</option>
                  </select>
                </td>
                <td className="text-[10px] uppercase tracking-widest text-neutral-400">
                  {[p.is_featured && "Feat", p.is_trending && "Trend", p.is_best_seller && "Best", p.is_new && "New", p.is_limited && "Ltd"].filter(Boolean).join(" · ")}
                </td>
                <td className="text-right pr-3">
                  <button onClick={() => openEdit(p)} className="p-2 hover:text-[color:var(--pl-orange)]"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => del(p.id)} className="p-2 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="p-10 text-center text-neutral-500">No products match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto p-6">
          <div className="bg-neutral-950 border border-neutral-800 w-full max-w-3xl p-6 my-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display uppercase text-2xl">{editing === "new" ? "New Product" : "Edit Product"}</h2>
              <button onClick={() => setEditing(null)}><X /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                ["name", "Name", 2, "text"], ["slug", "Slug (auto)", 2, "text"],
                ["description", "Description", 2, "textarea"],
                ["price", "Price ₹", 1, "number"], ["discount_percent", "Discount %", 1, "number"],
                ["stock_quantity", "Stock", 1, "number"],
                ["material", "Material", 2, "text"], ["size", "Size", 1, "text"], ["finish", "Finish", 1, "text"],
              ].map(([k, label, span, type]) => (
                <div key={k} className={span === 2 ? "col-span-2" : "col-span-2 md:col-span-1"}>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</label>
                  {type === "textarea" ? (
                    <textarea value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} rows={3} className="w-full mt-1 bg-neutral-900 border border-neutral-800 px-3 py-2 focus:outline-none focus:border-neutral-600" />
                  ) : (
                    <input
                      type={type}
                      min={k === "stock_quantity" ? 0 : undefined}
                      step={k === "stock_quantity" ? 1 : undefined}
                      value={form[k]}
                      onChange={(e) => (type === "number" ? setNumberField(k, e.target.value) : setForm({ ...form, [k]: e.target.value }))}
                      onBlur={() => {
                        if (k === "stock_quantity" && parseStockInput(form.stock_quantity) === null) {
                          setForm((f) => ({ ...f, stock_quantity: 0 }));
                        }
                      }}
                      className="w-full mt-1 bg-neutral-900 border border-neutral-800 px-3 py-2 focus:outline-none focus:border-neutral-600"
                    />
                  )}
                </div>
              ))}
              <div className="col-span-2 md:col-span-1">
                <label className="text-[10px] uppercase tracking-widest text-neutral-500">Category</label>
                <select value={form.category_slug} onChange={(e) => setForm({ ...form, category_slug: e.target.value })} className="w-full mt-1 bg-neutral-900 border border-neutral-800 px-3 py-2 focus:outline-none">
                  {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-[10px] uppercase tracking-widest text-neutral-500">Status</label>
                <select
                  data-testid="admin-product-form-status"
                  value={normalizeProductStatus(form)}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full mt-1 bg-neutral-900 border border-neutral-800 px-3 py-2 focus:outline-none"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="SOLD_OUT">Sold Out</option>
                  <option value="COMING_SOON">Coming Soon</option>
                </select>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-[10px] uppercase tracking-widest text-neutral-500">Visibility</label>
                <select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })} className="w-full mt-1 bg-neutral-900 border border-neutral-800 px-3 py-2 focus:outline-none">
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-neutral-500 block mb-2">Product images</label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {form.images.filter(Boolean).map((u, i) => (
                    <div key={i} className="relative aspect-[3/4] bg-neutral-800 group">
                      <img src={resolveMedia(u)} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setForm({ ...form, images: form.images.filter((_, k) => k !== i) })} className="absolute top-1 right-1 p-1 bg-black/80 text-white opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => fileRef.current?.click()} className="aspect-[3/4] border border-dashed border-neutral-700 text-neutral-500 hover:text-white hover:border-neutral-500 flex flex-col items-center justify-center gap-1 text-xs uppercase tracking-widest">
                    <Upload className="w-4 h-4" />
                    {uploading ? "Uploading…" : "Upload"}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "images")} />
                </div>
                <textarea rows={2} placeholder="Or paste image URLs (comma or newline separated)" value={form.images.join("\n")} onChange={(e) => setForm({ ...form, images: e.target.value.split(/[\n,]/).map(s => s.trim()).filter(Boolean) })} className="w-full bg-neutral-900 border border-neutral-800 px-3 py-2 focus:outline-none text-xs" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-neutral-500 block mb-2">Lifestyle image (shown on hover)</label>
                <div className="flex gap-2 items-start">
                  {form.lifestyle_image && (
                    <div className="relative w-24 aspect-[3/4] bg-neutral-800 group shrink-0">
                      <img src={resolveMedia(form.lifestyle_image)} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setForm({ ...form, lifestyle_image: "" })} className="absolute top-1 right-1 p-1 bg-black/80 text-white opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  )}
                  <div className="flex-1">
                    <input value={form.lifestyle_image} onChange={(e) => setForm({ ...form, lifestyle_image: e.target.value })} placeholder="Lifestyle image URL" className="w-full bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm" />
                    <button type="button" onClick={() => lifestyleRef.current?.click()} className="mt-2 pl-btn pl-btn-ghost-dark !py-1.5 !px-3 !text-[10px]"><Upload className="w-3 h-3" /> Upload</button>
                    <input ref={lifestyleRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], "lifestyle")} />
                  </div>
                </div>
              </div>
              <div className="col-span-2 flex flex-wrap gap-4 pt-2">
                {["is_featured", "is_trending", "is_best_seller", "is_new", "is_limited"].map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />
                    {k.replace("is_", "").replace("_", " ")}
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="pl-btn pl-btn-ghost-dark">Cancel</button>
              <button data-testid="admin-save-product" onClick={save} className="pl-btn pl-btn-primary">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Products;
