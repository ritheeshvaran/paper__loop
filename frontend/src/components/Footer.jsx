import React from "react";
import { Link } from "react-router-dom";
import { Instagram, MessageCircle, Mail, Phone, MapPin } from "lucide-react";

export const Footer = ({ settings }) => {
  return (
    <footer data-testid="site-footer" className="pl-section-dark relative overflow-hidden">
      <div className="pl-container py-24 md:py-32">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-14 md:gap-16">
          <div className="md:col-span-2">
            <h2 className="font-display text-editorial uppercase leading-none">
              Your room.<br />Your fandom.<br /><span className="text-[color:var(--pl-orange)]">Your style.</span>
            </h2>
            <p className="mt-7 text-white/60 max-w-md text-sm leading-relaxed">
              Museum-grade posters and premium acrylic keychains for the ones who curate their space with intent.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link to="/shop?type=posters" className="pl-btn pl-btn-primary">Shop Posters</Link>
              <Link to="/shop?type=keychains" className="pl-btn pl-btn-ghost-dark">Shop Keychains</Link>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-white/50 mb-5">Reach us</div>
            <ul className="space-y-4 text-sm text-white/80">
              <li className="flex items-center gap-2.5"><Instagram className="w-4 h-4 shrink-0" /><a href={settings?.instagram_url || "#"} target="_blank" rel="noreferrer" className="hover:text-[color:var(--pl-orange)] transition-colors">Instagram</a></li>
              <li className="flex items-center gap-2.5"><MessageCircle className="w-4 h-4 shrink-0" /><a href={settings?.whatsapp_url || "#"} target="_blank" rel="noreferrer" className="hover:text-[color:var(--pl-orange)] transition-colors">WhatsApp</a></li>
              <li className="flex items-center gap-2.5"><Mail className="w-4 h-4 shrink-0" /><a href={`mailto:${settings?.contact_email || ""}`} className="hover:text-[color:var(--pl-orange)] transition-colors">{settings?.contact_email || "hello@paperandloop.com"}</a></li>
              <li className="flex items-center gap-2.5"><Phone className="w-4 h-4 shrink-0" /><span>{settings?.contact_phone}</span></li>
              <li className="flex items-start gap-2.5"><MapPin className="w-4 h-4 shrink-0 mt-0.5" /><span>{settings?.address}</span></li>
            </ul>
          </div>
        </div>

        <div className="mt-20 pt-10 border-t border-white/10 flex flex-col md:flex-row justify-between gap-5 text-xs text-white/40 uppercase tracking-widest">
          <div>© {new Date().getFullYear()} Paper &amp; Loop. All rights reserved.</div>
          <div className="flex gap-7 flex-wrap">
            <Link to="/about" className="hover:text-[color:var(--pl-orange)] transition-colors">About</Link>
            <Link to="/shop" className="hover:text-[color:var(--pl-orange)] transition-colors">Shop</Link>
            <Link to="/coming-soon" className="hover:text-[color:var(--pl-orange)] transition-colors">Coming Soon</Link>
            <span>No delivery charges</span>
            <span>Secure UPI payment</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
