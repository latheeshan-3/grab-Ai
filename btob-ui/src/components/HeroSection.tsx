"use client";

import { useState } from "react";
import Link from "next/link";

const services = [
  {
    id: "medical",
    name: "Medical Centers",
    icon: "🏥",
    tagline: "Streamline patient scheduling, specialist assignments, and keep HIPAA-compliant records.",
    accent: "medical",
    stats: [
      { label: "Active Doctors", value: "24" },
      { label: "Bookings Today", value: "184" },
      { label: "Avg. Wait Time", value: "8 min" },
    ],
    preview: {
      title: "Apex Care Medical Center",
      type: "Cardiology & General Clinic",
      items: [
        { name: "Dr. Amira Nair", slot: "09:30 AM - 10:00 AM", status: "Confirmed", badge: "Cardiology" },
        { name: "Dr. Marcus Chen", slot: "10:15 AM - 10:45 AM", status: "In Progress", badge: "Pediatrics" },
        { name: "Sarah Jenkins", slot: "11:00 AM - 11:30 AM", status: "Available", badge: "General Consultation" },
      ],
    },
  },
  {
    id: "salon",
    name: "Salons & Spas",
    icon: "💆‍♀️",
    tagline: "Manage stylist schedules, premium services, automatic reminders, and client deposits.",
    accent: "salon",
    stats: [
      { label: "Active Stylists", value: "12" },
      { label: "Appointments Today", value: "78" },
      { label: "Service Margin", value: "94%" },
    ],
    preview: {
      title: "Bella Vita Salon & Spa",
      type: "Premium Styling & Spa Services",
      items: [
        { name: "Swedish Massage (60 Min)", slot: "12:00 PM - 01:00 PM", status: "Booked", badge: "Spa Treatment" },
        { name: "Balayage & Hair Trim", slot: "02:30 PM - 04:30 PM", status: "Confirmed", badge: "Hair Salon" },
        { name: "Deep Tissue Therapy", slot: "05:00 PM - 06:00 PM", status: "Available", badge: "Spa Treatment" },
      ],
    },
  },
  {
    id: "parking",
    name: "Parking Lots",
    icon: "🚗",
    tagline: "Coordinate space reservations, EV charging bays, and real-time valet status mapping.",
    accent: "parking",
    stats: [
      { label: "Total Spots", value: "350" },
      { label: "Reserved Today", value: "210" },
      { label: "EV Bays Free", value: "8/12" },
    ],
    preview: {
      title: "ParkSecure Solutions",
      type: "Multi-level Reservation & Valet",
      items: [
        { name: "Spot A-12 (Level 1)", slot: "08:00 AM - 06:00 PM", status: "Occupied", badge: "Reserved Slot" },
        { name: "Spot B-04 (Level 2)", slot: "01:30 PM - 03:30 PM", status: "Reserved", badge: "Hourly Valet" },
        { name: "Spot C-08 (Level 1)", slot: "All Day Availability", status: "Available", badge: "EV Charging" },
      ],
    },
  },
  {
    id: "restaurant",
    name: "Restaurants",
    icon: "🍽️",
    tagline: "Optimize dining table allocations, party sizes, reservation deposits, and peak hours.",
    accent: "restaurant",
    stats: [
      { label: "Total Tables", value: "32" },
      { label: "Covers Tonight", value: "145" },
      { label: "VIP Bookings", value: "6" },
    ],
    preview: {
      title: "The Bistro & Hearth",
      type: "Fine Dining & Event Hosting",
      items: [
        { name: "Table 4 (4 Guests)", slot: "07:00 PM - 09:00 PM", status: "Seated", badge: "Standard Dining" },
        { name: "Table 12 (2 Guests)", slot: "08:30 PM - 10:00 PM", status: "Confirmed", badge: "Patio Table" },
        { name: "VIP Lounge (8 Guests)", slot: "09:00 PM - 11:30 PM", status: "Available", badge: "Private Event" },
      ],
    },
  },
  {
    id: "meetings",
    name: "Personal Meetings",
    icon: "🤝",
    tagline: "Integrate with calendar systems, customize booking links, and handle timezones easily.",
    accent: "meetings",
    stats: [
      { label: "Host Profiles", value: "8" },
      { label: "Meetings Today", value: "29" },
      { label: "Sync Integrations", value: "4" },
    ],
    preview: {
      title: "ConnectFlow Consultants",
      type: "Corporate Advising & Client Meetings",
      items: [
        { name: "15-Min Discovery Call", slot: "10:00 AM - 10:15 AM", status: "Booked", badge: "Video Call" },
        { name: "1-Hour Strategy Session", slot: "02:00 PM - 03:00 PM", status: "Confirmed", badge: "In-Person" },
        { name: "30-Min Project Sync", slot: "04:30 PM - 05:00 PM", status: "Available", badge: "Phone Call" },
      ],
    },
  },
];

const themeClasses: Record<string, {
  text: string;
  bg: string;
  border: string;
  glow: string;
  pill: string;
  btn: string;
  dot: string;
}> = {
  medical: {
    text: "text-indigo-600",
    bg: "bg-indigo-50",
    border: "border-indigo-100",
    glow: "rgba(79, 70, 229, 0.06)",
    pill: "bg-indigo-100 text-indigo-800",
    btn: "bg-indigo-600 hover:bg-indigo-700",
    dot: "bg-indigo-500",
  },
  salon: {
    text: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-100",
    glow: "rgba(244, 63, 94, 0.06)",
    pill: "bg-rose-100 text-rose-800",
    btn: "bg-rose-600 hover:bg-rose-700",
    dot: "bg-rose-500",
  },
  parking: {
    text: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-100",
    glow: "rgba(245, 158, 11, 0.06)",
    pill: "bg-amber-100 text-amber-800",
    btn: "bg-amber-600 hover:bg-amber-700",
    dot: "bg-amber-500",
  },
  restaurant: {
    text: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    glow: "rgba(16, 185, 129, 0.06)",
    pill: "bg-emerald-100 text-emerald-800",
    btn: "bg-emerald-600 hover:bg-emerald-700",
    dot: "bg-emerald-500",
  },
  meetings: {
    text: "text-sky-600",
    bg: "bg-sky-50",
    border: "border-sky-100",
    glow: "rgba(14, 165, 233, 0.06)",
    pill: "bg-sky-100 text-sky-800",
    btn: "bg-sky-600 hover:bg-sky-700",
    dot: "bg-sky-500",
  },
};

export default function HeroSection() {
  const [activeTab, setActiveTab] = useState("medical");
  
  const currentService = services.find((s) => s.id === activeTab) || services[0];
  const theme = themeClasses[currentService.accent] || themeClasses.medical;

  return (
    <section className="w-full pt-32 pb-20 px-6 flex flex-col items-center bg-white overflow-hidden">
      <div className="max-w-6xl w-full text-center flex flex-col items-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-xs font-bold text-indigo-600 tracking-wider uppercase">
            Central Booking Hub
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-gray-900 leading-tight mb-5 max-w-4xl">
          The Central Booking Application
          <br />
          <span className="gradient-text">For Every Kind of Service</span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
          Empower your business locations with <strong>Grab My Seat</strong>. Manage medical clinics, salons, valet parking, restaurants, and client meetings — all from a single white-label booking portal.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 w-full max-w-md">
          <Link
            href="/auth/sign-up"
            className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl transition-all shadow-md hover:shadow-lg text-center"
          >
            Start Your Free Hub
          </Link>
          <a
            href="#features"
            className="w-full sm:w-auto px-8 py-3.5 border border-gray-200 hover:border-gray-300 text-gray-600 font-semibold text-sm rounded-xl transition-colors text-center"
          >
            Explore Features
          </a>
        </div>

        {/* Interactive Dashboard Showcase */}
        <div className="w-full max-w-4xl mb-16 relative">
          {/* Subtle Glow Ring behind the showcase */}
          <div
            className="absolute -inset-4 rounded-3xl opacity-50 blur-3xl pointer-events-none transition-all duration-500"
            style={{
              background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)`,
            }}
          />

          <div className="relative bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
            {/* Service selector tabs */}
            <div className="flex flex-wrap border-b border-gray-100 bg-gray-50/50 p-2 gap-1.5">
              {services.map((service) => {
                const isActive = service.id === activeTab;
                const activeTheme = themeClasses[service.accent];
                return (
                  <button
                    key={service.id}
                    onClick={() => setActiveTab(service.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      isActive
                        ? `${activeTheme.bg} ${activeTheme.text} ${activeTheme.border} border shadow-sm`
                        : "text-gray-500 hover:text-gray-800 hover:bg-gray-100/50"
                    }`}
                  >
                    <span className="text-base">{service.icon}</span>
                    <span>{service.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Showcase details area */}
            <div className="grid grid-cols-1 md:grid-cols-12 p-6 sm:p-8 text-left gap-8">
              {/* Left pane: description and metrics */}
              <div className="md:col-span-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{currentService.icon}</span>
                    <h3 className="text-xl font-bold text-gray-900">{currentService.name}</h3>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed mb-6">
                    {currentService.tagline}
                  </p>
                </div>

                {/* Micro Stats Grid */}
                <div className="grid grid-cols-3 gap-3 pt-6 border-t border-gray-100">
                  {currentService.stats.map((s, idx) => (
                    <div key={idx}>
                      <span className="text-lg font-extrabold text-gray-900">{s.value}</span>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right pane: booking UI mockup */}
              <div className="md:col-span-7 bg-gray-50 border border-gray-100 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-gray-200/60 pb-3">
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Live Schedule Preview</h4>
                    <p className="text-sm font-extrabold text-gray-900 mt-0.5">{currentService.preview.title}</p>
                  </div>
                  <span className="text-[11px] font-bold text-gray-400">{currentService.preview.type}</span>
                </div>

                {/* Mock bookings list */}
                <div className="flex flex-col gap-2.5">
                  {currentService.preview.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-3.5 rounded-xl border border-gray-100 flex items-center justify-between shadow-xs hover:border-gray-200 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${theme.dot}`} />
                        <div>
                          <p className="text-sm font-bold text-gray-800">{item.name}</p>
                          <span className="text-[11px] text-gray-400 font-semibold">{item.slot}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                          {item.badge}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                            item.status === "Available"
                              ? "bg-emerald-50 text-emerald-700"
                              : item.status === "In Progress"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Custom active CTA */}
                <button
                  className={`w-full py-2.5 rounded-xl text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 mt-2 ${theme.btn}`}
                >
                  Configure Booking Rules
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Global Platform Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl w-full border-t border-gray-100 pt-8">
          {[
            { value: "500K+", label: "Bookings Managed" },
            { value: "5+", label: "Service Industries" },
            { value: "99.99%", label: "System Uptime" },
            { value: "4.9/5", label: "Client Rating" },
          ].map((stat) => (
            <div key={stat.label} className="py-2">
              <p className="text-2xl font-extrabold text-gray-900">{stat.value}</p>
              <p className="text-xs font-semibold text-gray-400 mt-1 uppercase tracking-wider">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
