import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { MediaImg } from "@/components/MediaImg";
import { resolveMedia } from "@/lib/media";

const Settings = () => {
  const [s, setS] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get("/settings").then((r) => setS(r.data)); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/admin/settings", s);
      setS(data);
      toast.success("Settings saved");
    } catch { toast.error("Failed"); } finally { setSaving(false); }
  };

  const fields = [
    ["announcement", "Announcement bar text", "text"],
    ["logo_url", "Logo URL", "text"],
    ["gpay_qr_url", "GPay QR image URL", "text"],
    ["upi_id", "UPI ID", "text"],
    ["instagram_url", "Instagram URL", "text"],
    ["whatsapp_url", "WhatsApp URL", "text"],
    ["contact_email", "Contact email", "email"],
    ["contact_phone", "Contact phone", "text"],
    ["address", "Address", "text"],
  ];

  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-neutral-500">Store</div>
      <h1 className="font-display uppercase text-3xl mt-1 mb-6">Settings</h1>

      <div className="bg-neutral-900 border border-neutral-800 p-6 max-w-2xl space-y-4">
        {fields.map(([k, label, type]) => (
          <div key={k}>
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</label>
            <input
              data-testid={`settings-${k}`}
              type={type} value={s[k] || ""}
              onChange={(e) => setS({ ...s, [k]: e.target.value })}
              className="w-full mt-1 bg-neutral-800 border border-neutral-700 px-3 py-2 focus:outline-none focus:border-neutral-500"
            />
          </div>
        ))}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-neutral-500">Hero images (one URL per line)</label>
          <textarea
            rows={4}
            value={(s.hero_images || []).join("\n")}
            onChange={(e) => setS({ ...s, hero_images: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })}
            className="w-full mt-1 bg-neutral-800 border border-neutral-700 px-3 py-2 focus:outline-none focus:border-neutral-500"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {s.gpay_qr_url && <MediaImg src={s.gpay_qr_url} alt="QR" className="border border-neutral-800 bg-white p-2" />}
        </div>
        <button onClick={save} disabled={saving} data-testid="settings-save" className="pl-btn pl-btn-primary">{saving ? "Saving…" : "Save Settings"}</button>
      </div>
    </div>
  );
};
export default Settings;
