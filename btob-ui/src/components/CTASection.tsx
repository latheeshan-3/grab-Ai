"use client";

import Link from "next/link";

export default function CTASection() {
  return (
    <section className="w-full relative py-24 overflow-hidden flex justify-center">
      {/* Orb */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, rgba(79, 70, 229, 0.04) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="relative z-10 max-w-5xl w-full px-4 sm:px-6">
        <div
          className="rounded-3xl p-12 sm:p-16 text-center relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(79, 70, 229, 0.03) 0%, rgba(14, 165, 233, 0.01) 100%)",
            border: "1px solid rgba(79, 70, 229, 0.12)",
          }}
        >
          {/* Decorative rings */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border pointer-events-none animate-spin-slow"
            style={{ borderColor: "rgba(79, 70, 229, 0.03)" }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border pointer-events-none animate-counter-spin"
            style={{ borderColor: "rgba(14, 165, 233, 0.03)" }}
          />

          <div className="relative z-10">
            <div className="badge badge-primary mx-auto mb-6">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
              Ready to launch?
            </div>

            <h2
              className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 mb-6"
              style={{ letterSpacing: "-0.04em" }}
            >
              Transform Your Booking
              <br />
              <span className="gradient-text">Experience Today</span>
            </h2>

            <p className="text-lg sm:text-xl mb-10 max-w-2xl mx-auto text-slate-500 font-medium">
              Join 5,000+ businesses already using Grab My Seat. Set up your tenant
              account in minutes and start accepting bookings today.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <Link
                href="/auth/sign-up"
                id="cta-section-signup"
                className="btn-primary px-10 py-4 rounded-2xl text-base font-bold"
              >
                Create Free Account
              </Link>
              <Link
                href="/auth/sign-in"
                id="cta-section-signin"
                className="btn-ghost px-10 py-4 rounded-2xl text-base font-semibold"
              >
                Sign In to Dashboard
              </Link>
            </div>

            <p className="text-sm text-slate-400 font-semibold">
              ✓ Free 14-day trial &nbsp;&nbsp; ✓ No credit card required &nbsp;&nbsp; ✓ Setup in &lt;30 minutes
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
