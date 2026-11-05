"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, Lock, Mail, ArrowRight, AlertCircle, Sparkles, KeyRound, Eye, EyeOff } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("from") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      // Successful login -> Redirect to dashboard
      router.push(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected authentication error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Helper for quick role profile selection
  const selectAccountProfile = (accountEmail: string, accountPass: string) => {
    setEmail(accountEmail);
    setPassword(accountPass);
    setError(null);
  };

  return (
    <div className="w-full max-w-md relative z-10">
      {/* Brand header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center p-3 bg-[#0B132B] border border-blue-500/20 rounded-2xl shadow-xl shadow-blue-950/40 mb-4">
          <ShieldCheck className="w-9 h-9 text-blue-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          SecureID Portal
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Enterprise RBAC &amp; Autonomous AI Agent Identity System
        </p>
      </div>

      {/* Login Card */}
      <div className="bg-[#0B132B]/90 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/60">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white">Sign In</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Authenticate to access role-governed security controls.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3 text-rose-300 text-xs leading-relaxed animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Corporate Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@secureid.local"
                className="w-full pl-10 pr-3.5 py-2.5 bg-[#111A36] border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[11px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 cursor-pointer"
              >
                {showPassword ? (
                  <>
                    <EyeOff className="w-3 h-3" /> Hide
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" /> Show
                  </>
                )}
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="admin123 or 123456"
                className="w-full pl-10 pr-3.5 py-2.5 bg-[#111A36] border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-600 text-white font-medium text-sm rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Corporate Role Identity Profiles */}
        <div className="mt-8 pt-6 border-t border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                Quick Demo Sign-In (Click to Fill)
              </span>
            </div>
            <span className="text-[10px] text-blue-400 font-medium">Demo Mode</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => selectAccountProfile("admin@secureid.local", "admin123")}
              className="p-2.5 bg-[#111A36] hover:bg-[#1A264F] border border-slate-700/60 rounded-xl text-left transition-colors group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white group-hover:text-blue-300">
                  Admin
                </span>
                <span className="text-[10px] text-blue-400 font-mono">admin123</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">admin@secureid.local</div>
            </button>

            <button
              type="button"
              onClick={() => selectAccountProfile("gayatri@gmail.com", "123456")}
              className="p-2.5 bg-[#111A36] hover:bg-[#1A264F] border border-blue-500/30 rounded-xl text-left transition-colors group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-300 group-hover:text-blue-200">
                  Gayatri (Admin)
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">123456</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">gayatri@gmail.com</div>
            </button>

            <button
              type="button"
              onClick={() => selectAccountProfile("manager@secureid.local", "manager123")}
              className="p-2.5 bg-[#111A36] hover:bg-[#1A264F] border border-slate-700/60 rounded-xl text-left transition-colors group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white group-hover:text-blue-300">
                  Manager
                </span>
                <span className="text-[10px] text-slate-300 font-mono">manager123</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">manager@secureid.local</div>
            </button>

            <button
              type="button"
              onClick={() => selectAccountProfile("employee@secureid.local", "employee123")}
              className="p-2.5 bg-[#111A36] hover:bg-[#1A264F] border border-slate-700/60 rounded-xl text-left transition-colors group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white group-hover:text-blue-300">
                  Employee
                </span>
                <span className="text-[10px] text-slate-300 font-mono">employee123</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">employee@secureid.local</div>
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span className="flex items-center gap-1.5">
              <KeyRound className="w-3 h-3 text-slate-500" /> Passwords: <code className="text-emerald-400 text-[10px]">admin123</code> / <code className="text-emerald-400 text-[10px]">123456</code>
            </span>
            <span className="text-[10px] text-slate-500">Simple Demo Auth</span>
          </div>
        </div>
      </div>

      {/* Security badge footer */}
      <div className="mt-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
        <span>Protected with HTTP-Only Cookie Sessions &amp; RBAC Zero-Trust</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#060A17] text-slate-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 right-10 w-80 h-80 bg-sky-500/5 rounded-full blur-2xl pointer-events-none" />

      <Suspense fallback={<div className="text-slate-400 text-sm">Loading security portal...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
