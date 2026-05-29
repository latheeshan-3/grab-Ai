"use client";

export default function TypingIndicator() {
  return (
    <div className="chat-message-enter flex w-full justify-start">
      <div className="flex max-w-[80%] flex-col gap-1 items-start">
        {/* Avatar + label */}
        <div
          className="flex items-center gap-2 text-xs"
          style={{ color: "var(--chat-text-muted)" }}
        >
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            style={{
              background: "var(--chat-accent-glow)",
              color: "var(--chat-accent-light)",
            }}
          >
            AI
          </div>
          <span>Assistant is typing</span>
        </div>

        {/* Typing bubble */}
        <div
          className="flex items-center gap-1.5 rounded-2xl px-5 py-3.5"
          style={{
            background: "var(--chat-bot-bubble)",
            border: "1px solid var(--chat-border)",
            borderBottomLeftRadius: "4px",
          }}
        >
          <span
            className="typing-dot inline-block h-2 w-2 rounded-full"
            style={{ background: "var(--chat-accent-light)" }}
          />
          <span
            className="typing-dot inline-block h-2 w-2 rounded-full"
            style={{ background: "var(--chat-accent-light)" }}
          />
          <span
            className="typing-dot inline-block h-2 w-2 rounded-full"
            style={{ background: "var(--chat-accent-light)" }}
          />
        </div>
      </div>
    </div>
  );
}
