"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../configs/supabase";
import { sidebarItems } from "./dashboard-data";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ id?: string; email?: string; user_metadata?: { center_name?: string } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setUser(session.user);
        } else {
          router.push("/auth/sign-in");
        }
      } catch {
        router.push("/auth/sign-in");
      } finally {
        setLoading(false);
      }
    };
    checkUser();
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth/sign-in");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-sm text-slate-500 font-bold">Loading dashboard…</span>
        </div>
      </div>
    );
  }

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "TN";
  const orgName = user?.user_metadata?.center_name ?? "Your Organisation";

  // Find active item based on current route path
  const activeItem = sidebarItems.find((item) => item.href === pathname) || sidebarItems[0];

  return (
    <div className="min-h-screen flex bg-[#f8fafc]" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* ── Mobile overlay ────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside
        className={`fixed md:static top-0 left-0 h-full z-40 w-64 border-r border-slate-200 bg-white flex flex-col justify-between transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        style={{ minHeight: "100vh" }}
      >
        <div className="p-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 mb-10">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)", boxShadow: "0 4px 12px rgba(79,70,229,0.25)" }}
            >
              <span className="text-white font-black text-base">G</span>
            </div>
            <span className="font-black text-slate-900 text-base">
              Grab<span className="gradient-text">My Seat</span>
            </span>
          </Link>

          {/* Nav */}
          <nav className="flex flex-col gap-1">
            {sidebarItems.map(({ id, label, href, icon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={id}
                  id={`sidebar-${id}`}
                  href={href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all text-left ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                  style={isActive ? { boxShadow: "inset 0 0 0 1px #c7d2fe" } : {}}
                >
                  <span className={isActive ? "text-indigo-600" : "text-slate-400"}>{icon}</span>
                  {label}
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Profile footer */}
        <div className="p-5 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)" }}
            >
              {initials}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-900 truncate">{orgName}</p>
              <p className="text-xs text-slate-400 font-medium truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 transition-all"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-5 sm:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              className="p-2 rounded-lg hover:bg-slate-100 md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <div>
              <h1 className="text-base font-black text-slate-900">
                {activeItem?.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Tenant Mode
            </span>
            <button className="relative p-2 rounded-xl hover:bg-slate-50 border border-slate-200/70 transition-colors">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
