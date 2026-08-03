import React from "react";
import { Outlet, NavLink, Link, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, ShoppingCart, Tag, Users, Settings, LogOut, ExternalLink, Percent, BarChart3, Quote, ScrollText } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/categories", label: "Categories", icon: Tag },
  { to: "/admin/discounts", label: "Discounts", icon: Percent },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/testimonials", label: "Reviews", icon: Quote },
  { to: "/admin/activity", label: "Activity", icon: ScrollText },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

const AdminShell = () => {
  const { user, logout } = useAuth();
  const navHook = useNavigate();
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex">
      <aside data-testid="admin-sidebar" className="w-60 bg-black border-r border-neutral-900 flex flex-col p-4 shrink-0 sticky top-0 h-screen">
        <Link to="/admin" className="font-display uppercase text-xl mb-8 pl-2">
          Paper &amp; Loop<span className="text-[color:var(--pl-orange)]">.</span>
          <div className="text-[10px] tracking-widest text-neutral-500 font-body normal-case">Admin Console</div>
        </Link>

        <nav className="flex-1 space-y-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={`admin-nav-${(n.label || "").toLowerCase()}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-sm transition-colors ${isActive ? "bg-[color:var(--pl-orange)] text-white" : "text-neutral-300 hover:bg-neutral-900 hover:text-white"}`
              }
            >
              <n.icon className="w-4 h-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 border-t border-neutral-900 pt-4 text-xs text-neutral-500">
          <div className="truncate">{user?.email}</div>
          <div className="mt-3 flex gap-2">
            <Link to="/" className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 border border-neutral-800 hover:border-neutral-600 text-[10px] uppercase tracking-widest"><ExternalLink className="w-3 h-3" /> Store</Link>
            <button onClick={() => { logout(); navHook("/"); }} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 border border-neutral-800 hover:border-red-600 hover:text-red-500 text-[10px] uppercase tracking-widest"><LogOut className="w-3 h-3" /> Sign out</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-10 min-w-0">
        <Outlet />
      </main>
    </div>
  );
};
export default AdminShell;
