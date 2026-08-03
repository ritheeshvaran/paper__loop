import React, { useEffect, useState } from "react";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { Eye, EyeOff, Trash2, Star } from "lucide-react";
import { resolveMedia } from "@/lib/media";
import { formatDate } from "@/lib/format";

/** Admin Reviews — reuses testimonials collection & page route. */
const Testimonials = () => {
  const [items, setItems] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [g, setG] = useState({ image_url: "", caption: "", link_url: "", sort_order: 0 });

  const load = () => {
    api.get("/admin/testimonials").then((r) => setItems(r.data)).catch(() => setItems([]));
    api.get("/gallery").then((r) => setGallery(r.data)).catch(() => setGallery([]));
  };
  useEffect(() => { load(); }, []);

  const delT = async (id) => {
    if (!window.confirm("Delete this review?")) return;
    await api.delete(`/admin/testimonials/${id}`);
    toast.success("Review deleted");
    load();
  };

  const toggleHidden = async (it) => {
    try {
      await api.put(`/admin/testimonials/${it.id}/visibility`, { hidden: !it.hidden });
      toast.success(it.hidden ? "Review visible" : "Review hidden");
      load();
    } catch {
      toast.error("Couldn't update visibility");
    }
  };

  const addG = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/gallery", g);
      toast.success("Gallery item added");
      setG({ image_url: "", caption: "", link_url: "", sort_order: 0 });
      load();
    } catch { toast.error("Failed"); }
  };
  const delG = async (id) => {
    if (!window.confirm("Delete?")) return;
    await api.delete(`/admin/gallery/${id}`);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div>
        <div className="text-[11px] uppercase tracking-widest text-neutral-500">Customer feedback</div>
        <h1 className="font-display uppercase text-3xl mt-1 mb-2">Reviews</h1>
        <p className="text-sm text-neutral-500 mb-4">
          Reviews are submitted by signed-in customers with a verified purchase. You can hide or delete them here.
        </p>
        <ul className="space-y-2" data-testid="admin-reviews-list">
          {items.map((it) => (
            <li key={it.id} className={`bg-neutral-900 border border-neutral-800 p-4 flex gap-3 items-start ${it.hidden ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <div className="flex gap-0.5">
                    {Array.from({ length: it.rating || 5 }).map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-[color:var(--pl-orange)] text-[color:var(--pl-orange)]" />
                    ))}
                  </div>
                  {it.verified_purchase && (
                    <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-green-700 text-green-400">Verified Purchase</span>
                  )}
                  {it.hidden && (
                    <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-neutral-600 text-neutral-400">Hidden</span>
                  )}
                </div>
                {it.title && <div className="font-display uppercase text-sm">{it.title}</div>}
                <div className="text-sm mt-1">"{it.quote}"</div>
                <div className="text-xs text-neutral-500 mt-1">
                  — {it.name}{it.location ? ` · ${it.location}` : ""} · {formatDate(it.created_at)}
                </div>
                {it.photo_url && (
                  <img src={resolveMedia(it.photo_url)} alt="" className="mt-2 h-16 w-auto object-cover border border-neutral-700" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => toggleHidden(it)} className="p-2 hover:text-[color:var(--pl-orange)]" title={it.hidden ? "Show" : "Hide"} data-testid={`review-hide-${it.id}`}>
                  {it.hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button type="button" onClick={() => delT(it.id)} className="p-2 hover:text-red-500" data-testid={`review-delete-${it.id}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
          {items.length === 0 && <li className="text-sm text-neutral-500">No reviews yet.</li>}
        </ul>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-widest text-neutral-500">Community wall</div>
        <h1 className="font-display uppercase text-3xl mt-1 mb-4">Gallery</h1>
        <form onSubmit={addG} className="bg-neutral-900 border border-neutral-800 p-5 space-y-3 mb-4">
          <input required placeholder="Image URL" value={g.image_url} onChange={(e) => setG({ ...g, image_url: e.target.value })} className="w-full bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
          <div className="flex items-center gap-2">
            <label className="pl-btn pl-btn-ghost-dark !py-1.5 !px-3 !text-[10px] cursor-pointer">
              Upload image
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.append("file", file);
                  try {
                    const token = localStorage.getItem("pl_token");
                    const res = await fetch(`${API}/admin/upload?folder=gallery`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}` },
                      body: fd,
                    });
                    if (!res.ok) throw new Error("Upload failed");
                    const { url } = await res.json();
                    setG((prev) => ({ ...prev, image_url: url }));
                    toast.success("Uploaded");
                  } catch {
                    toast.error("Upload failed");
                  }
                  e.target.value = "";
                }}
              />
            </label>
            {g.image_url && (
              <img src={resolveMedia(g.image_url)} alt="" className="h-10 w-10 object-cover border border-neutral-700" />
            )}
          </div>
          <input placeholder="Caption" value={g.caption} onChange={(e) => setG({ ...g, caption: e.target.value })} className="w-full bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
          <input placeholder="Link URL (optional)" value={g.link_url} onChange={(e) => setG({ ...g, link_url: e.target.value })} className="w-full bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
          <input type="number" placeholder="Sort order" value={g.sort_order} onChange={(e) => setG({ ...g, sort_order: Number(e.target.value) })} className="w-32 bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm" />
          <button className="pl-btn pl-btn-primary">Add</button>
        </form>
        <div className="grid grid-cols-3 gap-2">
          {gallery.map((it) => (
            <div key={it.id} className="relative aspect-square bg-neutral-800 group">
              <img src={resolveMedia(it.image_url)} alt="" className="w-full h-full object-cover" />
              <button onClick={() => delG(it.id)} className="absolute top-1 right-1 p-1 bg-black/70 text-white opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default Testimonials;
