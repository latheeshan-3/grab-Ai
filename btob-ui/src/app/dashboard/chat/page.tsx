"use client";

export default function ChatPage() {
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Chat</h2>
        <p className="text-sm text-slate-500 font-medium mt-1">Live conversation feed from your AI bot</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-8 flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#94a3b8" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
        </div>
        <h3 className="text-lg font-black text-slate-900">Chat Console</h3>
        <p className="text-sm text-slate-500 font-medium max-w-md">
          Real-time patient conversations from your WhatsApp AI bot will appear here. Coming after bot activation.
        </p>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-600 border border-amber-100">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Awaiting bot activation
        </span>
      </div>
    </div>
  );
}
