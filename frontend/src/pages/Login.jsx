import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { brandAsset } from "@/lib/assets";

const Login = () => {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/account";
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await login(form.email, form.password);
      toast.success("Welcome back.");
      nav(next);
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) setError("We couldn't find an account with that email.");
      else if (status === 401) setError("That password doesn't match. Try again or reset it.");
      else setError("Sign-in failed. Try again in a moment.");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* Left side - editorial visual */}
      <div className="hidden md:block relative bg-[color:var(--pl-black)] text-white overflow-hidden">
        <img src={brandAsset("authLogin")} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black" />
        <div className="relative z-10 p-12 h-full flex flex-col justify-between">
          <Link to="/" className="text-white uppercase tracking-widest text-xs flex items-center gap-2"><ArrowLeft className="w-3 h-3" /> Back to Paper &amp; Loop</Link>
          <div>
            <div className="text-[11px] tracking-[0.25em] uppercase text-[color:var(--pl-orange)] mb-4">Members Only</div>
            <h1 className="font-display uppercase text-5xl leading-none">Sign in.<br />Get the <span className="text-[color:var(--pl-orange)]">drop.</span></h1>
          </div>
        </div>
      </div>

      {/* Right side - form */}
      <div className="flex items-center justify-center p-8 md:p-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-sm">
          <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Existing Customer</div>
          <h2 className="font-display uppercase text-3xl">Welcome back.</h2>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-neutral-500">Email</label>
              <input data-testid="login-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full mt-1 border-b border-neutral-300 focus:border-black bg-transparent py-2 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-neutral-500">Password</label>
              <input data-testid="login-password" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full mt-1 border-b border-neutral-300 focus:border-black bg-transparent py-2 focus:outline-none" />
            </div>
            {error && <div data-testid="login-error" className="text-sm text-red-600">{error}</div>}
            <button type="submit" data-testid="login-submit" disabled={busy} className="pl-btn pl-btn-primary w-full">{busy ? "Signing in…" : "Sign in"}</button>
            <div className="text-right">
              <Link to="/forgot-password" data-testid="link-forgot" className="text-xs uppercase tracking-widest font-bold text-neutral-500 hover:text-[color:var(--pl-orange)]">Forgot password?</Link>
            </div>
          </form>

          <div className="mt-8 text-sm text-neutral-600">
            New here? <Link to={`/register?next=${encodeURIComponent(next)}`} data-testid="link-register" className="text-black underline hover:text-[color:var(--pl-orange)] uppercase tracking-widest text-xs font-bold">Create Account →</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
export default Login;
