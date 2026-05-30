const features = [
  {
    icon: "📅",
    title: "Smart Scheduling",
    description: "Configurable templates for slots, tables, parking spaces, and meetings. Fill gaps automatically.",
    color: "bg-indigo-50 text-indigo-600",
  },
  {
    icon: "🏢",
    title: "Multi-Tenant Hub",
    description: "Onboard unlimited locations, franchise branches, or departments. Each tenant gets their own layout.",
    color: "bg-sky-50 text-sky-600",
  },
  {
    icon: "📊",
    title: "Real-Time Analytics",
    description: "Track sales, booking velocity, and staff performance with custom reports and live dashboards.",
    color: "bg-rose-50 text-rose-600",
  },
  {
    icon: "🔒",
    title: "Enterprise Compliance",
    description: "End-to-end data encryption, customizable HIPAA/GDPR terms, and secure payment processing.",
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: "📱",
    title: "Mobile-First Portals",
    description: "Customers book and manage reservations from any phone or tablet. Auto-send SMS and email reminders.",
    color: "bg-orange-50 text-orange-600",
  },
  {
    icon: "⚡",
    title: "Seamless API & Sync",
    description: "Connect with calendars (Google, Outlook), payment gateways, and CRMs via open REST APIs.",
    color: "bg-violet-50 text-violet-600",
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="w-full py-20 px-6 bg-gray-50/50 flex justify-center">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-3">Features</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
            Everything Your Booking Hub Needs
          </h2>
          <p className="text-base text-gray-500 max-w-lg mx-auto">
            Built for multi-service operators and business groups. Reduce admin overhead and maximize booking efficiency.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-xl border border-gray-100 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-lg mb-4 ${f.color}`}>
                {f.icon}
              </span>
              <h3 className="text-base font-bold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
