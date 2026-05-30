"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "../../../configs/supabase";

function formatTime12(timeStr: string): string {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10);
    const m = parts[1];
    const period = h < 12 ? "AM" : "PM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m} ${period}`;
  }
  return timeStr;
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T00:00:00");
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    if (dateStr === todayStr) {
      return "Today";
    }
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    if (dateStr === tomorrowStr) {
      return "Tomorrow";
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch (e) {
    return dateStr;
  }
}

const GRAB_UI_URL = process.env.NEXT_PUBLIC_GRAB_UI_URL || "http://localhost:8085";

export default function DashboardOverviewPage() {
  const [orgName, setOrgName] = useState("Your Organisation");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const itemsPerPage = 5;

  const chatUrl = tenantId ? `${GRAB_UI_URL}/chat?tenant_id=${tenantId}` : "";

  const handleCopyUrl = useCallback(async () => {
    if (!chatUrl) return;
    try {
      await navigator.clipboard.writeText(chatUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = chatUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [chatUrl]);

  const handleDownloadQr = useCallback(() => {
    const canvas = document.getElementById("tenant-qr-canvas") as HTMLCanvasElement;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${orgName.replace(/\s+/g, "-").toLowerCase()}.png`;
    a.click();
  }, [orgName]);

  const fetchDashboardData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const userId = session.user.id;
        setTenantId(userId);
        
        let name = session.user.user_metadata?.center_name || "Your Organisation";
        
        // Fallback to query tenants table if they saved a custom organization name
        const { data: tenant, error: tenantErr } = await supabase
          .from("tenants")
          .select("organization_name")
          .eq("tenant_id", userId)
          .maybeSingle();

        if (tenant && !tenantErr && tenant.organization_name) {
          name = tenant.organization_name;
        }
        setOrgName(name);

        // Fetch bookings
        const { data: bookingsData, error: bookingsErr } = await supabase
          .from("bookings")
          .select("*")
          .eq("tenant_id", userId)
          .order("appointment_date", { ascending: true })
          .order("appointment_time", { ascending: true });

        if (!bookingsErr && bookingsData) {
          setBookings(bookingsData);
        }
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleCancelBooking = async (bookingId: string) => {
    if (!window.confirm("Are you sure you want to cancel this booking?")) return;
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", bookingId);
      
      if (error) throw error;
      
      // Update local state
      setBookings(prev => 
        prev.map(b => b.id === bookingId ? { ...b, status: "cancelled" } : b)
      );
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      alert("Failed to cancel booking. Please try again.");
    }
  };

  const handleConfirmBooking = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "confirmed", confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", bookingId);
      
      if (error) throw error;
      
      // Update local state
      setBookings(prev => 
        prev.map(b => b.id === bookingId ? { ...b, status: "confirmed" } : b)
      );
    } catch (err) {
      console.error("Failed to confirm booking:", err);
      alert("Failed to confirm booking. Please try again.");
    }
  };

  // Metrics
  const totalBookings = bookings.length;
  const confirmedCount = bookings.filter(b => b.status?.toLowerCase() === "confirmed").length;
  const cancelledCount = bookings.filter(b => b.status?.toLowerCase() === "cancelled").length;
  const pendingCount = bookings.filter(b => b.status?.toLowerCase() === "pending").length;

  // Filter and pagination
  const filteredBookings = bookings.filter((b) => {
    const q = searchQuery.toLowerCase();
    return (
      b.patient_name?.toLowerCase().includes(q) ||
      (b.doctor_name && b.doctor_name.toLowerCase().includes(q)) ||
      b.service_name?.toLowerCase().includes(q) ||
      b.status?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(filteredBookings.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedBookings = filteredBookings.slice(startIndex, startIndex + itemsPerPage);

  const displayCountStart = filteredBookings.length > 0 ? startIndex + 1 : 0;
  const displayCountEnd = Math.min(startIndex + itemsPerPage, filteredBookings.length);

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      {/* QR Code Modal */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.6)", backdropFilter: "blur(6px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowQrModal(false); }}
        >
          <div
            className="relative w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            style={{ background: "#fff" }}
          >
            {/* Modal header */}
            <div
              className="px-6 pt-6 pb-5"
              style={{ background: "linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <path strokeLinecap="round" d="M14 14h2m0 0h3m-3 0v3m0-3v-2" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-black text-base">Booking QR Code</h3>
                    <p className="text-white/70 text-xs font-medium">Clients scan this to book with you</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowQrModal(false)}
                  className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* QR Code body */}
            <div className="px-6 py-6 flex flex-col items-center gap-5">
              {/* Org badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100">
                <span className="text-xs">🏥</span>
                <span className="text-xs font-bold text-indigo-700">{orgName}</span>
              </div>

              {/* QR Canvas */}
              <div
                className="p-4 rounded-2xl border-2 border-slate-100"
                style={{ boxShadow: "0 8px 32px rgba(79,70,229,0.12)" }}
              >
                {tenantId ? (
                  <QRCodeCanvas
                    id="tenant-qr-canvas"
                    value={chatUrl}
                    size={200}
                    level="H"
                    marginSize={1}
                    fgColor="#1e1b4b"
                    bgColor="#ffffff"
                  />
                ) : (
                  <div className="w-[200px] h-[200px] flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* URL display */}
              <div className="w-full">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Chat URL</p>
                <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <code className="flex-1 text-xs text-slate-700 font-mono truncate">{chatUrl}</code>
                  <button
                    id="qr-copy-url-btn"
                    onClick={handleCopyUrl}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={{
                      background: copySuccess ? "#10b981" : "#4f46e5",
                      color: "white",
                    }}
                  >
                    {copySuccess ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="w-full p-3 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-2">
                <span className="text-sm">💡</span>
                <p className="text-xs text-amber-700 font-medium">
                  Print or display this QR code at your reception. Clients scan it to open the AI booking chat pre-configured for your center.
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex w-full gap-3">
                <button
                  id="qr-download-btn"
                  onClick={handleDownloadQr}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all"
                  style={{ background: "#4f46e5", color: "white" }}
                >
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PNG
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all"
                >
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Hello, {orgName} 👋</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Here&apos;s your Medical Center bookings overview for today.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start">
          <button
            id="dashboard-generate-qr"
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-all"
            style={{ background: "#eef2ff" }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path strokeLinecap="round" d="M14 14h2m0 0h3m-3 0v3m0-3v-2" />
            </svg>
            Generate QR
          </button>
          <Link
            id="dashboard-new-booking"
            href="/dashboard/manage-bookings"
            className="btn-primary px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-2"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Booking
          </Link>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total Bookings", value: totalBookings, delta: "Lifetime bookings", up: null, icon: "📅" },
          { title: "Confirmed", value: confirmedCount, delta: "Active appointments", up: true, icon: "✅" },
          { title: "Cancelled", value: cancelledCount, delta: "Cancelled slots", up: false, icon: "❌" },
          { title: "Pending", value: pendingCount, delta: "Awaiting approval", up: null, icon: "⏳" },
        ].map((m) => (
          <div
            key={m.title}
            className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{m.title}</p>
              <span className="text-xl">{m.icon}</span>
            </div>
            <p className="text-3xl font-extrabold text-slate-900">{loading ? "..." : m.value}</p>
            <p className={`text-xs font-semibold mt-1.5 ${m.up === true ? "text-emerald-600" : m.up === false ? "text-rose-500" : "text-amber-500"}`}>
              {m.delta}
            </p>
          </div>
        ))}
      </div>

      {/* Services available banner */}
      <div
        className="rounded-2xl p-5 flex items-center gap-4 border"
        style={{ background: "linear-gradient(135deg, #eef2ff 0%, #e0f2fe 100%)", borderColor: "#c7d2fe" }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #4f46e5, #0ea5e9)", boxShadow: "0 4px 12px rgba(79,70,229,0.25)" }}
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="font-black text-slate-900 text-sm">Medical Center AI Booking Bot · Active</p>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Your WhatsApp AI bot is live and accepting appointments with RAG-powered responses.</p>
        </div>
        <Link
          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors whitespace-nowrap"
          href="/dashboard/bot-setup"
        >
          Manage Bot →
        </Link>
      </div>

      {/* Bookings table */}
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">Today&apos;s Appointments</h3>
            <p className="text-xs text-slate-400 font-medium">Real-time queue status</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-400 text-xs font-medium text-slate-700"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-transparent">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                <span className="text-xs text-slate-400 font-bold">Loading appointments…</span>
              </div>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  {["Patient", "Doctor", "Department/Service", "Time", "Status", "Actions"].map((col) => (
                    <th key={col} className="px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedBookings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-sm font-medium text-slate-400">
                      No appointments found.
                    </td>
                  </tr>
                ) : (
                  displayedBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {b.patient_name ? b.patient_name.split(" ").map((w: string) => w[0]).join("").toUpperCase() : "?"}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-800">{b.patient_name}</span>
                            <span className="text-[10px] text-slate-400 font-medium">{b.whatsapp_number}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-600">
                        {b.doctor_name || <span className="text-xs text-slate-400 italic">No doctor assigned</span>}
                      </td>
                      <td className="px-5 py-4 text-xs font-medium text-slate-500">{b.service_name}</td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-bold text-slate-700">{formatTime12(b.appointment_time)}</p>
                        <p className="text-xs text-slate-400">{formatDateDisplay(b.appointment_date)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                            b.status?.toLowerCase() === "confirmed"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : b.status?.toLowerCase() === "pending"
                              ? "bg-amber-50 text-amber-700 border border-amber-100"
                              : "bg-rose-50 text-rose-700 border border-rose-100"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-3">
                          {b.status?.toLowerCase() === "pending" && (
                            <button
                              onClick={() => handleConfirmBooking(b.id)}
                              className="text-xs font-bold text-emerald-600 hover:text-emerald-800 transition-colors"
                            >
                              Confirm
                            </button>
                          )}
                          {b.status?.toLowerCase() !== "cancelled" && (
                            <button
                              onClick={() => handleCancelBooking(b.id)}
                              className="text-xs font-bold text-rose-500 hover:text-rose-700 transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                          <Link
                            href="/dashboard/manage-bookings"
                            className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            Manage
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        {!loading && filteredBookings.length > 0 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-400">
            <span>
              Showing {displayCountStart} to {displayCountEnd} of {filteredBookings.length} entries
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

