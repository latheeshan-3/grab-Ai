"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../configs/supabase";

export default function SignUp() {
  const router = useRouter();
  const [centerName, setCenterName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Step 1: Create the auth user.
      // ⚠️  Supabase "Confirm email" must be DISABLED in your project:
      //     Dashboard → Authentication → Settings → toggle off "Confirm email"
      // When disabled, signUp() returns a live session immediately.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            center_name: centerName,
            role: "tenant_admin",
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      const userId = data.user?.id;
      const session = data.session;

      if (!userId) {
        setError("Account creation failed. Please try again.");
        return;
      }

      // Step 2: Insert into public.profiles.
      // This only works when email confirmation is OFF (session is active now).
      // If email confirmation is ON, auth.uid() = null and RLS will block this.
      if (session) {
        const { error: profileError } = await supabase
          .from("profiles")
          .insert({
            id: userId,
            name: centerName,
            email: email,
            provider: "email",
            role: "tenant_admin",
          });

        if (profileError) {
          // Profile insert failed — log the detail but still allow dashboard access.
          // Common cause: duplicate ID (user already exists), or RLS misconfiguration.
          console.error("Profile insert error:", profileError.message, profileError.details);
        }

        // Step 3: Redirect directly to dashboard (no email confirmation needed)
        router.push("/dashboard");
      } else {
        // Fallback: email confirmation is still ON in Supabase settings.
        // Show a message asking the user to verify their email first.
        setError(
          "Email confirmation is enabled on this project. Please disable it in your Supabase Dashboard → Authentication → Settings → uncheck 'Confirm email', then try again."
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
      setError(msg);
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
            Create Your Account
          </h2>
          <p className="text-sm text-slate-500 font-medium text-center mb-6">
            Register your business and access your tenant dashboard
          </p>

          {error && (
            <div className="mb-4 p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-sm font-semibold flex items-start gap-2">
              <svg
                width="16"
                height="16"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                className="flex-shrink-0 mt-0.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSignUp} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="centerName"
                className="text-xs font-bold text-slate-700 uppercase tracking-wider"
              >
                Business / Organization Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="centerName"
                type="text"
                required
                value={centerName}
                onChange={(e) => setCenterName(e.target.value)}
                placeholder="Apex Medical Center"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-medium text-sm transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-xs font-bold text-slate-700 uppercase tracking-wider"
              >
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@organization.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-medium text-sm transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-xs font-bold text-slate-700 uppercase tracking-wider"
              >
                Password <span className="text-rose-500">*</span>
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-medium text-sm transition-all"
              />
            </div>

            <button
              type="submit"
              id="signup-submit-btn"
              disabled={loading}
              className="btn-primary w-full py-3.5 rounded-xl font-bold text-sm transition-all mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin"
                    width="16"
                    height="16"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Creating Account…
                </span>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <div className="divider my-6" />

          <p className="text-center text-sm text-slate-500 font-medium">
            Already have an account?{" "}
            <Link
              href="/auth/sign-in"
              className="text-indigo-600 font-bold hover:text-indigo-800 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
