"use client";

interface ChatMessageProps {
  message: string;
  sender: "user" | "bot";
  timestamp: string;
}

export default function ChatMessage({
  message,
  sender,
  timestamp,
}: ChatMessageProps) {
  const isUser = sender === "user";

  return (
    <div
      className={`chat-message-enter flex w-full ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`flex max-w-[80%] flex-col gap-1 ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        {/* Avatar + label */}
        <div
          className={`flex items-center gap-2 text-xs ${
            isUser ? "flex-row-reverse" : "flex-row"
          }`}
          style={{ color: "var(--chat-text-muted)" }}
        >
          {/* Avatar circle */}
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            style={{
              background: isUser
                ? "var(--chat-user-bubble)"
                : "var(--chat-accent-glow)",
              color: isUser ? "#fff" : "var(--chat-accent-light)",
            }}
          >
            {isUser ? "U" : "AI"}
          </div>
          <span>{isUser ? "You" : "Assistant"}</span>
        </div>

        {/* Bubble */}
        <div
          className="rounded-2xl px-4 py-3 text-sm leading-relaxed"
          style={{
            background: isUser
              ? "var(--chat-user-bubble)"
              : "var(--chat-bot-bubble)",
            color: isUser ? "#fff" : "var(--chat-text-primary)",
            borderBottomRightRadius: isUser ? "4px" : undefined,
            borderBottomLeftRadius: !isUser ? "4px" : undefined,
            border: !isUser ? "1px solid var(--chat-border)" : undefined,
          }}
        >
          {message}
        </div>

        {/* Timestamp */}
        <span
          className="text-[10px] px-1"
          style={{ color: "var(--chat-text-muted)" }}
        >
          {timestamp}
        </span>
      </div>
    </div>
  );
}
