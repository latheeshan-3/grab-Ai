"use client";

import Link from "next/link";

export default function BotSetupPage() {
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Bot Setup</h2>
        <p className="text-sm text-slate-500 font-medium mt-1">Configure your AI booking assistant</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-8 flex flex-col items-center text-center gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #4f46e5, #0ea5e9)", boxShadow: "0 8px 24px rgba(79,70,229,0.2)" }}
        >
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082" />
          </svg>
        </div>
        <h3 className="text-lg font-black text-slate-900">Bot Configuration</h3>
        <p className="text-sm text-slate-500 font-medium max-w-md">
          Complete your Account Settings to unlock full bot configuration. Set up your knowledge base, WhatsApp integration, and response templates here.
        </p>
        <Link
          className="btn-primary px-6 py-3 rounded-xl text-sm font-bold mt-2 text-center"
          href="/dashboard/account-settings"
        >
          Go to Account Settings →
        </Link>
      </div>
    </div>
  );
}
