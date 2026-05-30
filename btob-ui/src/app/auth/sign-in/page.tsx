"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../configs/supabase";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 bg-[#fcfcfd]">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-8 group">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)",
              boxShadow: "0 4px 12px rgba(79, 70, 229, 0.2)",
            }}
          >
            <span className="text-white font-black text-base leading-none">G</span>
          </div>
          <span className="font-black text-slate-900 text-xl tracking-tight">
            Grab<span className="gradient-text"> My Seat</span>
          </span>
        </Link>

        {/* Card */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200/60 shadow-sm">
          <h2 className="text-2xl font-black text-slate-900 mb-2 text-center">
            Welcome Back
          </h2>
          <p className="text-sm text-slate-500 font-medium text-center mb-6">
            Sign in to your business operator dashboard
          </p>

          {error && (
            <div className="mb-4 p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-sm font-semibold flex items-center gap-2">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@organization.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-900 font-medium text-sm transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="password" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <a href="#" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                  Forgot Password?
                </a>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-900 font-medium text-sm transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 rounded-xl font-bold text-sm transition-all mt-2"
            >
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </form>

          <div className="divider my-6" />

          <p className="text-center text-sm text-slate-500 font-medium">
            Don&apos;t have an account?{" "}
            <Link href="/auth/sign-up" className="text-indigo-600 font-bold hover:text-indigo-800 transition-colors">
              Sign up for free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
