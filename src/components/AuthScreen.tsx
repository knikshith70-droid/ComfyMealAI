import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Logo, Wordmark } from "./Logo";
import { useI18n } from "../lib/i18n";
import { Leaf, Mail, Apple, Chrome, Loader2, AlertCircle, KeyRound, ArrowLeft, CheckCircle2, UserPlus, LogIn } from "lucide-react";

type AuthMode = "signin" | "signup";

export function AuthScreen() {
  const { t } = useI18n();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState<null | "send" | "verify" | "google" | "apple">(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const edgeUrl = (name: string) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
  const edgeHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  });

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setOtpSent(false);
    setCode("");
    setError(null);
    setInfo(null);
  };

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError(t("email"));
      return;
    }
    setLoading("send");
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(edgeUrl("send-otp"), {
        method: "POST",
        headers: edgeHeaders(),
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? `Request failed (${res.status}).`);
      }
      setOtpSent(true);
      if (json.dev_code) {
        setInfo(`Dev mode — no email sent. Your code is ${json.dev_code}`);
      } else {
        setInfo(t("enterCode"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(null);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) {
      setError(t("digitCode"));
      return;
    }
    setLoading("verify");
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(edgeUrl("verify-otp"), {
        method: "POST",
        headers: edgeHeaders(),
        body: JSON.stringify({ email, code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? `Verification failed (${res.status}).`);
      }
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
      });
      if (setSessionError) throw setSessionError;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the code.");
    } finally {
      setLoading(null);
    }
  };

  const resetOtp = () => {
    setOtpSent(false);
    setCode("");
    setError(null);
    setInfo(null);
  };

  const signInWith = async (provider: "google" | "apple") => {
    setLoading(provider);
    setError(null);
    setInfo(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(null);
    }
  };

  const isSignUp = mode === "signup";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center gap-2.5">
        <Logo />
        <Wordmark />
      </header>

      <main className="flex-1 flex items-center justify-center px-5 pb-16">
        <div className="w-full max-w-md animate-fade-up">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-sage-100 text-sage-700 mb-4">
              <Leaf className="h-7 w-7" />
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl text-charcoal-900 text-balance">
              {otpSent
                ? t("checkEmail")
                : isSignUp
                ? "Create your account"
                : t("landingHead")}
            </h1>
            <p className="muted mt-3 text-balance">
              {otpSent
                ? t("enterCode")
                : isSignUp
                ? "Enter your email — we'll send a 6-digit code to get you started."
                : t("landingSub")}
            </p>
          </div>

          <div className="card p-6 sm:p-7">
            {/* Sign in / Sign up tab toggle */}
            {!otpSent && (
              <div className="flex rounded-xl bg-cream-100 p-1 mb-6">
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all duration-200 ${
                    !isSignUp
                      ? "bg-white shadow-sm text-charcoal-900"
                      : "text-charcoal-700/60 hover:text-charcoal-900"
                  }`}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all duration-200 ${
                    isSignUp
                      ? "bg-white shadow-sm text-charcoal-900"
                      : "text-charcoal-700/60 hover:text-charcoal-900"
                  }`}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Sign up
                </button>
              </div>
            )}

            {!otpSent ? (
              <>
                {/* OAuth — shown only in sign-in mode */}
                {!isSignUp && (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <button
                        type="button"
                        onClick={() => signInWith("google")}
                        disabled={loading !== null}
                        className="btn-secondary"
                      >
                        {loading === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Chrome className="h-4 w-4" />}
                        Google
                      </button>
                      <button
                        type="button"
                        onClick={() => signInWith("apple")}
                        disabled={loading !== null}
                        className="btn-secondary"
                      >
                        {loading === "apple" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Apple className="h-4 w-4" />}
                        Apple
                      </button>
                    </div>

                    <div className="relative my-5">
                      <div className="absolute inset-0 flex items-center"><div className="w-full h-px bg-cream-300" /></div>
                      <div className="relative flex justify-center"><span className="bg-cream-50 px-3 text-xs uppercase tracking-wider muted">or with email code</span></div>
                    </div>
                  </>
                )}

                {isSignUp && (
                  <div className="rounded-xl bg-sage-50 border border-sage-200 px-4 py-3 mb-5 text-sm text-sage-800">
                    No password needed. We'll email you a one-time code to verify your address.
                  </div>
                )}

                <form onSubmit={sendOtp} className="space-y-4">
                  <div>
                    <label className="label" htmlFor="email">{t("email")}</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-charcoal-700/40" />
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="input pl-10"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 text-sm text-clay-700 bg-clay-50 border border-clay-200 rounded-xl px-3.5 py-3 animate-fade-in">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button type="submit" disabled={loading !== null} className="btn-primary w-full">
                    {loading === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {isSignUp ? "Send verification code" : t("sendCode")}
                  </button>
                </form>

                {isSignUp && (
                  <p className="text-center text-xs muted mt-4">
                    Already have an account?{" "}
                    <button type="button" onClick={() => switchMode("signin")} className="text-sage-700 font-medium hover:underline">
                      Sign in
                    </button>
                  </p>
                )}
              </>
            ) : (
              <form onSubmit={verifyCode} className="space-y-4 animate-fade-up">
                <div className="flex items-center justify-between rounded-xl bg-cream-100/70 border border-cream-200/70 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="text-xs muted">{t("codeSentTo")}</div>
                    <div className="font-medium text-charcoal-900 truncate">{email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={resetOtp}
                    className="btn-ghost text-xs px-2.5 py-1.5 shrink-0"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> {t("change")}
                  </button>
                </div>

                <div>
                  <label className="label" htmlFor="code">{t("digitCode")}</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-charcoal-700/40" />
                    <input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      className="input pl-10 tracking-[0.4em] font-mono text-lg"
                    />
                  </div>
                </div>

                {info && (
                  <div className="flex items-start gap-2 text-sm text-sage-800 bg-sage-50 border border-sage-200 rounded-xl px-3.5 py-3 animate-fade-in">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{info}</span>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 text-sm text-clay-700 bg-clay-50 border border-clay-200 rounded-xl px-3.5 py-3 animate-fade-in">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button type="submit" disabled={loading !== null || code.length < 6} className="btn-primary w-full">
                  {loading === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {isSignUp ? "Verify & create account" : t("verifyContinue")}
                </button>

                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={loading !== null}
                  className="btn-ghost w-full text-sm"
                >
                  {t("resendCode")}
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-xs muted mt-5">
            {t("authNote")}
          </p>
        </div>
      </main>
    </div>
  );
}
