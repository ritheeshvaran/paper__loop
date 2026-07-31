import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { brandAsset } from "@/lib/assets";

const formatApiError = (err) => {
  const d = err.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d?.message) return d.message;
  return "Something went wrong. Try again.";
};

const Register = () => {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/account";
  const { register } = useAuth();

  const [step, setStep] = useState(1); // 1: email → 2: OTP → 3: full details
  const [email, setEmail] = useState(params.get("email") || "");
  const [otpToken, setOtpToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sendOtp = async (e) => {
    e?.preventDefault();
    setError(""); setBusy(true);
    try {
      const { data } = await api.post("/auth/send-otp", { email, purpose: "registration" });
      toast.success("If that email can receive a code, one has been sent.");
      if (data.dev_code) toast.message("Dev code (email not configured)", { description: `OTP: ${data.dev_code}`, duration: 12000 });
      setStep(2);
      return data.retry_after ?? 60;
    } catch (err) {
      setError(formatApiError(err));
      throw err;
    } finally { setBusy(false); }
  };

  const onOtpVerified = (token) => { setOtpToken(token); setStep(3); };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:block relative bg-[color:var(--pl-black)] text-white overflow-hidden">
        <img src={brandAsset("authRegister")} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black" />
        <div className="relative z-10 p-12 h-full flex flex-col justify-between">
          <Link to="/" className="text-white uppercase tracking-widest text-xs flex items-center gap-2"><ArrowLeft className="w-3 h-3" /> Back to Paper &amp; Loop</Link>
          <div>
            <div className="text-[11px] tracking-[0.25em] uppercase text-[color:var(--pl-orange)] mb-4">Join The Drop List</div>
            <h1 className="font-display uppercase text-5xl leading-none">Your wall.<br /><span className="text-[color:var(--pl-orange)]">Your rules.</span></h1>
            <div className="mt-10 flex gap-2 text-[10px] uppercase tracking-widest text-white/50">
              {["Email", "Verify", "Details"].map((l, i) => (
                <React.Fragment key={l}>
                  <span className={`flex items-center gap-2 ${step > i ? "text-[color:var(--pl-orange)]" : step === i + 1 ? "text-white" : ""}`}>
                    {step > i + 1 ? <Check className="w-3 h-3" /> : <span className={`w-4 h-4 border ${step >= i + 1 ? "border-[color:var(--pl-orange)]" : "border-white/30"} inline-flex items-center justify-center`}>{i + 1}</span>}
                    {l}
                  </span>
                  {i < 2 && <span className="text-white/20">·</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-16">
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
          {step === 1 && (
            <>
              <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Step 1 · Your email</div>
              <h2 className="font-display uppercase text-3xl">Let's start.</h2>
              <p className="text-sm text-neutral-500 mt-2">We'll send a 6-digit code to verify it's really you.</p>
              <form onSubmit={sendOtp} className="mt-8 space-y-5">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-neutral-500">Email</label>
                  <input data-testid="register-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mt-1 border-b border-neutral-300 focus:border-black bg-transparent py-2 focus:outline-none" />
                </div>
                {error && <div data-testid="register-error" className="text-sm text-red-600">{error}</div>}
                <button data-testid="register-send-otp" disabled={busy} className="pl-btn pl-btn-primary w-full">{busy ? "Sending code…" : "Send Verification Code →"}</button>
              </form>
              <div className="mt-6 text-sm text-neutral-600">
                Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`} data-testid="link-login" className="text-black underline hover:text-[color:var(--pl-orange)] uppercase tracking-widest text-xs font-bold">Sign in →</Link>
              </div>
            </>
          )}

          {step === 2 && (
            <OtpStep email={email} purpose="registration" onVerified={onOtpVerified} onBack={() => setStep(1)} onResend={sendOtp} />
          )}

          {step === 3 && (
            <DetailsStep email={email} otpToken={otpToken} onDone={async (data) => {
              try {
                await register({ ...data, email, otp_token: otpToken });
                toast.success("Welcome to Paper & Loop.");
                nav(next);
              } catch (err) {
                toast.error(formatApiError(err) || "Sign-up failed.");
              }
            }} />
          )}
        </motion.div>
      </div>
    </div>
  );
};

export const OtpStep = ({ email, purpose, onVerified, onBack, onResend }) => {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resend, setResend] = useState(60);
  const refs = useRef([]);

  useEffect(() => {
    refs.current[0]?.focus();
    const t = setInterval(() => setResend((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const setAt = (i, v) => {
    const clean = v.replace(/\D/g, "").slice(0, 1);
    const arr = [...digits]; arr[i] = clean; setDigits(arr);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (arr.every((c) => c) && arr.join("").length === 6) verify(arr.join(""));
  };

  const onKey = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  };

  const onPaste = (e) => {
    const t = (e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (t.length === 6) { e.preventDefault(); setDigits(t.split("")); verify(t); }
  };

  const verify = async (code) => {
    setBusy(true); setError("");
    try {
      const { data } = await api.post("/auth/verify-otp", { email, code, purpose });
      toast.success("Email verified.");
      onVerified(data.otp_token);
    } catch (err) {
      setError(formatApiError(err));
      setDigits(["", "", "", "", "", ""]); refs.current[0]?.focus();
    } finally { setBusy(false); }
  };

  const doResend = async () => {
    if (resend > 0) return;
    try {
      const data = onResend ? await onResend() : null;
      const retry = typeof data === "number" ? data : 60;
      toast.success("If that email can receive a code, one has been sent.");
      setResend(retry);
      setDigits(["", "", "", "", "", ""]);
      refs.current[0]?.focus();
    } catch (e) {
      toast.error(formatApiError(e));
      const retry = e.response?.data?.detail?.retry_after;
      if (retry) setResend(retry);
    }
  };

  return (
    <>
      <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Step 2 · Verify email</div>
      <h2 className="font-display uppercase text-3xl">Check your inbox.</h2>
      <p className="text-sm text-neutral-500 mt-2">We sent a 6-digit code to <b>{email}</b>.</p>
      <div className="mt-8 flex gap-2 md:gap-3" onPaste={onPaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            data-testid={`otp-input-${i}`}
            inputMode="numeric" pattern="[0-9]*" maxLength={1}
            value={d}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
            className="w-12 h-14 md:w-14 md:h-16 text-center font-display font-bold text-2xl border border-neutral-300 focus:border-black focus:outline-none"
          />
        ))}
      </div>
      {error && <div data-testid="otp-error" className="mt-3 text-sm text-red-600">{error}</div>}
      {busy && <div className="mt-3 text-sm text-neutral-500">Verifying…</div>}
      <div className="mt-6 flex items-center justify-between text-sm">
        <button onClick={onBack} className="uppercase tracking-widest text-xs font-bold text-neutral-500 hover:text-black">← Change email</button>
        <button onClick={doResend} disabled={resend > 0} className="uppercase tracking-widest text-xs font-bold disabled:text-neutral-400 hover:text-[color:var(--pl-orange)]">
          {resend > 0 ? `Resend in ${resend}s` : "Resend code"}
        </button>
      </div>
    </>
  );
};

const DetailsStep = ({ email, onDone }) => {
  const [f, setF] = useState({ name: "", password: "", confirm: "", phone: "",
    address_line1: "", address_line2: "", city: "", state: "", pincode: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (f.password.length < 8) return setError("Password must be at least 8 characters.");
    if (f.password !== f.confirm) return setError("Passwords don't match.");
    setBusy(true);
    const { confirm, ...payload } = f;
    await onDone(payload);
    setBusy(false);
  };

  return (
    <>
      <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Step 3 · Your details</div>
      <h2 className="font-display uppercase text-3xl">Almost done.</h2>
      <p className="text-sm text-neutral-500 mt-2">Verified: <b>{email}</b>. Add your shipping info.</p>
      <form onSubmit={submit} className="mt-8 grid grid-cols-2 gap-4">
        {[
          ["name", "Full name", "text", true, 2],
          ["phone", "Phone", "tel", false, 2],
          ["password", "Password", "password", true, 1],
          ["confirm", "Confirm password", "password", true, 1],
          ["address_line1", "Address line 1", "text", false, 2],
          ["address_line2", "Address line 2", "text", false, 2],
          ["city", "City", "text", false, 1],
          ["state", "State", "text", false, 1],
          ["pincode", "Pincode", "text", false, 2],
        ].map(([key, label, type, req, span]) => (
          <div key={key} className={span === 2 ? "col-span-2" : "col-span-2 md:col-span-1"}>
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">{label}{req ? " *" : ""}</label>
            <input
              data-testid={`register-${key}`}
              type={type} required={req}
              value={f[key]}
              onChange={(e) => setF({ ...f, [key]: e.target.value })}
              className="w-full mt-1 border-b border-neutral-300 focus:border-black bg-transparent py-2 focus:outline-none"
            />
          </div>
        ))}
        {error && <div className="col-span-2 text-sm text-red-600">{error}</div>}
        <div className="col-span-2">
          <button data-testid="register-submit" disabled={busy} className="pl-btn pl-btn-primary w-full">{busy ? "Creating…" : "Create Account"}</button>
        </div>
      </form>
    </>
  );
};

export default Register;
