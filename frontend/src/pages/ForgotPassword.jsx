import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { OtpStep } from "@/pages/Register";
import { brandAsset } from "@/lib/assets";

const formatApiError = (err) => {
  const d = err.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d?.message) return d.message;
  return "Something went wrong. Try again.";
};

const ForgotPassword = () => {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otpToken, setOtpToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pw, setPw] = useState({ p1: "", p2: "" });

  const sendOtp = async (e) => {
    e?.preventDefault(); setError(""); setBusy(true);
    try {
      const { data } = await api.post("/auth/send-otp", { email, purpose: "password_reset" });
      toast.success("If that email can receive a code, one has been sent.");
      if (data.dev_code) toast.message("Dev code", { description: `OTP: ${data.dev_code}`, duration: 12000 });
      setStep(2);
      return data.retry_after ?? 60;
    } catch (err) {
      setError(formatApiError(err));
      throw err;
    } finally { setBusy(false); }
  };

  const reset = async (e) => {
    e.preventDefault(); setError("");
    if (pw.p1.length < 8) return setError("Password must be at least 8 characters.");
    if (pw.p1 !== pw.p2) return setError("Passwords don't match.");
    try {
      await api.post("/auth/reset-password", { email, otp_token: otpToken, new_password: pw.p1 });
      toast.success("Password reset. Sign in with your new password.");
      nav("/login");
    } catch (err) {
      setError(err.response?.data?.detail || "Reset failed.");
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:block relative bg-[color:var(--pl-black)] text-white overflow-hidden">
        <img src={brandAsset("authForgot")} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black" />
        <div className="relative z-10 p-12 h-full flex flex-col justify-between">
          <Link to="/login" className="text-white uppercase tracking-widest text-xs flex items-center gap-2"><ArrowLeft className="w-3 h-3" /> Back to sign in</Link>
          <div>
            <div className="text-[11px] tracking-[0.25em] uppercase text-[color:var(--pl-orange)] mb-4">Password Reset</div>
            <h1 className="font-display uppercase text-5xl leading-none">Forgot it?<br /><span className="text-[color:var(--pl-orange)]">Reset it.</span></h1>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-16">
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full max-w-md">
          {step === 1 && (
            <>
              <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Step 1 · Verify email</div>
              <h2 className="font-display uppercase text-3xl">Reset password.</h2>
              <p className="text-sm text-neutral-500 mt-2">Enter the email on your account. We'll send a code.</p>
              <form onSubmit={sendOtp} className="mt-8 space-y-5">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500">Email</label>
                  <input data-testid="forgot-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mt-1 border-b border-neutral-300 focus:border-black bg-transparent py-2 focus:outline-none" />
                </div>
                {error && <div data-testid="forgot-error" className="text-sm text-red-600">{error}</div>}
                <button data-testid="forgot-send-otp" disabled={busy} className="pl-btn pl-btn-primary w-full">{busy ? "Sending…" : "Send Code →"}</button>
              </form>
            </>
          )}

          {step === 2 && (
            <OtpStep email={email} purpose="password_reset" onVerified={(t) => { setOtpToken(t); setStep(3); }} onBack={() => setStep(1)} onResend={sendOtp} />
          )}

          {step === 3 && (
            <>
              <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Step 3 · New password</div>
              <h2 className="font-display uppercase text-3xl">Set new password.</h2>
              <form onSubmit={reset} className="mt-8 space-y-5">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500">New password</label>
                  <input data-testid="reset-p1" type="password" required value={pw.p1} onChange={(e) => setPw({ ...pw, p1: e.target.value })} className="w-full mt-1 border-b border-neutral-300 focus:border-black bg-transparent py-2 focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500">Confirm password</label>
                  <input data-testid="reset-p2" type="password" required value={pw.p2} onChange={(e) => setPw({ ...pw, p2: e.target.value })} className="w-full mt-1 border-b border-neutral-300 focus:border-black bg-transparent py-2 focus:outline-none" />
                </div>
                {error && <div className="text-sm text-red-600">{error}</div>}
                <button data-testid="reset-submit" className="pl-btn pl-btn-primary w-full">Reset Password</button>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};
export default ForgotPassword;
