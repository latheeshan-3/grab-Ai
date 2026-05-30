"use client";

const testimonials = [
  {
    quote:
      "Grab My Seat completely transformed how we manage appointments across our 3 clinics. Booking errors dropped by 80% in the first month.",
    name: "Dr. Amira Nair",
    role: "Director, HealthFirst Medical Group",
    avatar: "AN",
    color: "#4f46e5",
    rating: 5,
  },
  {
    quote:
      "The multi-location dashboard is a game-changer. I can oversee all our salon and spa locations from one screen, in real-time. It's exactly what we needed.",
    name: "Elena Rostova",
    role: "Owner, Bella Vita Salon & Spas",
    avatar: "ER",
    color: "#0ea5e9",
    rating: 5,
  },
  {
    quote:
      "Setup was incredibly fast. We configured our parking slot booking rules in under an hour. Customers love reserving spots in advance.",
    name: "Marcus Vance",
    role: "Operations Director, ParkSecure Solutions",
    avatar: "MV",
    color: "#f43f5e",
    rating: 5,
  },
  {
    quote:
      "Table turnover increased 35% after switching to Grab My Seat because we could finally fill last-minute cancellations automatically.",
    name: "Chef Mohamed Al-Rashid",
    role: "CEO, Al-Rashid Hospitality Group",
    avatar: "MA",
    color: "#10b981",
    rating: 5,
  },
  {
    quote:
      "The automated calendar sync alone is worth every penny. Clients book strategy consultations directly into open slots with zero hassle.",
    name: "Priya Sharma",
    role: "Founder, ConnectFlow Advising",
    avatar: "PS",
    color: "#f97316",
    rating: 5,
  },
  {
    quote:
      "Best SaaS investment we've made. We run checkups, fitness sessions, and meeting room bookings all under one central hub.",
    name: "David Park",
    role: "COO, Seoul Wellness Hub",
    avatar: "DP",
    color: "#8b5cf6",
    rating: 5,
  },
];

export default function TestimonialsSection() {
  return (
    <section id="testimonials" className="w-full relative py-28 overflow-hidden flex justify-center">
      {/* Gradient bg */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, transparent 0%, rgba(79, 70, 229, 0.02) 50%, transparent 100%)",
        }}
      />

      <div className="relative z-10 max-w-7xl w-full px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="badge badge-primary mx-auto mb-4">
            <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            Testimonials
          </div>
          <h2
            className="text-4xl sm:text-5xl font-black text-slate-900 mb-5"
            style={{ letterSpacing: "-0.03em" }}
          >
            Loved by Service
            <br />
            <span className="gradient-text">Providers Worldwide</span>
          </h2>
          <p className="text-lg max-w-xl mx-auto text-slate-500 font-medium">
            Join 5,000+ business locations who transformed their booking operations with Grab My Seat.
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="testimonial-card glass-card rounded-3xl p-7 flex flex-col gap-5"
            >
              {/* Stars */}
              <div className="flex gap-1">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <svg key={i} width="16" height="16" fill="#fbbf24" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                ))}
              </div>

              {/* Quote */}
              <blockquote
                className="text-base leading-relaxed flex-1 text-slate-600 font-medium italic"
              >
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-extrabold text-white"
                  style={{ background: `linear-gradient(135deg, ${t.color}, ${t.color}80)` }}
                >
                  {t.avatar}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500 font-medium">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Logos row */}
        <div className="mt-16">
          <p className="text-center text-sm mb-8 font-semibold text-slate-400">
            Trusted by leading service networks and franchises
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 opacity-60">
            {["HealthFirst", "BellaVita", "ParkSecure", "Al-Rashid", "ConnectFlow", "SeoulWellness"].map((name) => (
              <span
                key={name}
                className="text-base font-black tracking-tight text-slate-800"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
