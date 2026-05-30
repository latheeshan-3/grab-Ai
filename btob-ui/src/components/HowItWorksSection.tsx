const steps = [
  {
    number: "1",
    title: "Register Your Business",
    description: "Create your tenant account in minutes. Add your business location details and branding.",
  },
  {
    number: "2",
    title: "Configure Booking Flows",
    description: "Set up locations, staff slots, restaurant tables, parking rules, or consultation links.",
  },
  {
    number: "3",
    title: "Go Live & Accept Bookings",
    description: "Share your booking URL or embed the custom widget. Customers book 24/7 from any device.",
  },
  {
    number: "4",
    title: "Monitor & Scale Hubs",
    description: "Track scheduling trends and earnings in real-time. Scale to multiple locations or branches.",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="w-full py-20 px-6 flex justify-center">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-3">How It Works</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
            Get Started in Under 30 Minutes
          </h2>
          <p className="text-base text-gray-500 max-w-lg mx-auto">
            No complex coding. Just sign up, configure your scheduling templates, and begin taking reservations.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step) => (
            <div key={step.number} className="text-center">
              <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center mx-auto mb-4">
                {step.number}
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">{step.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <a
            href="/auth/sign-up"
            className="inline-flex items-center gap-2 px-7 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg transition-colors"
          >
            Start Your Free Account
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
