"use client";

import Link from "next/link";

const plans = [
  {
    name: "Starter",
    price: "$49",
    period: "/month",
    description: "Perfect for single-location businesses getting started.",
    color: "#4f46e5",
    features: [
      "Up to 500 bookings/month",
      "1 business location tenant",
      "Up to 5 staff members",
      "Client booking portal",
      "Email & SMS reminders",
      "Basic analytics",
      "Email support",
    ],
    cta: "Get Started",
    featured: false,
  },
  {
    name: "Professional",
    price: "$149",
    period: "/month",
    description: "For growing businesses managing multiple locations.",
    color: "#0ea5e9",
    features: [
      "Up to 5,000 bookings/month",
      "Up to 10 tenant locations",
      "Unlimited staff/operators",
      "White-label client portal",
      "Advanced reminder workflows",
      "Real-time analytics & reports",
      "API access & integrations",
      "Priority support",
    ],
    cta: "Start Free Trial",
    featured: true,
    badge: "Most Popular",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large business networks with custom requirements.",
    color: "#f43f5e",
    features: [
      "Unlimited bookings",
      "Unlimited location tenants",
      "Custom SLA & uptime guarantee",
      "SSO & LDAP integration",
      "Custom API & CRM integrations",
      "Dedicated account manager",
      "Onboarding & training",
      "24/7 phone support",
    ],
    cta: "Contact Sales",
    featured: false,
  },
];

export default function PricingSection() {
  return (
    <section id="pricing" className="w-full relative py-28 overflow-hidden flex justify-center">
      {/* BG accent */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, rgba(79, 70, 229, 0.03) 0%, transparent 70%)",
          filter: "blur(45px)",
        }}
      />

      <div className="relative z-10 max-w-7xl w-full px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="badge badge-primary mx-auto mb-4">
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Pricing
          </div>
          <h2
            className="text-4xl sm:text-5xl font-black text-slate-900 mb-5"
            style={{ letterSpacing: "-0.03em" }}
          >
            Transparent Pricing,
            <br />
            <span className="gradient-text">No Hidden Fees</span>
          </h2>
          <p className="text-lg max-w-2xl mx-auto text-slate-500 font-medium">
            Start free, scale as you grow. Every plan includes a 14-day free trial
            with no credit card required.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`pricing-card rounded-3xl p-8 flex flex-col gap-6 ${
                plan.featured ? "pricing-card featured" : "glass-card"
              }`}
              style={{
                border: plan.featured
                  ? `1px solid ${plan.color}35`
                  : "1px solid rgba(0, 0, 0, 0.06)",
                position: "relative",
              }}
            >
              {/* Popular badge */}
              {plan.featured && plan.badge && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-xs font-bold"
                  style={{
                    background: "linear-gradient(135deg, #4f46e5, #0ea5e9)",
                    color: "white",
                    whiteSpace: "nowrap",
                  }}
                >
                  {plan.badge}
                </div>
              )}

              {/* Plan name & description */}
              <div>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${plan.color}08`, border: `1px solid ${plan.color}18` }}
                >
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: plan.color }} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-1">{plan.name}</h3>
                <p className="text-sm text-slate-500 font-medium">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="flex items-end gap-1">
                <span
                  className="text-5xl font-extrabold text-slate-900"
                >
                  {plan.price}
                </span>
                <span className="text-sm pb-1.5 font-bold text-slate-400">
                  {plan.period}
                </span>
              </div>

              {/* Divider */}
              <div className="divider" />

              {/* Features */}
              <ul className="flex flex-col gap-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: `${plan.color}10` }}
                    >
                      <svg width="10" height="10" fill="none" viewBox="0 0 10 10">
                        <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke={plan.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span className="text-sm text-slate-600 font-medium">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href="/auth/sign-up"
                id={`pricing-${plan.name.toLowerCase()}`}
                className={`w-full py-3.5 rounded-2xl text-center text-sm font-bold transition-all duration-300 ${
                  plan.featured ? "btn-primary" : "btn-ghost"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Bottom note */}
        <p className="text-center mt-8 text-sm text-slate-400 font-semibold">
          All plans include 14-day free trial · No credit card required · Cancel anytime
        </p>
      </div>
    </section>
  );
}
