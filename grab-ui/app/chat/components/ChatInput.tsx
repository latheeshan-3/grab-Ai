"use client";

import { useState, useRef, useCallback, KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset height after send
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="flex items-end gap-3 rounded-2xl px-4 py-3 transition-all duration-200"
      style={{
        background: "var(--chat-input-bg)",
        border: "1px solid var(--chat-input-border)",
      }}
    >
      {/* Text input */}
      <textarea
        ref={textareaRef}
        id="chat-input"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          adjustHeight();
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? "Waiting for response..." : "Type your message..."}
        rows={1}
        className="flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:opacity-40"
        style={{
          color: "var(--chat-text-primary)",
          maxHeight: "120px",
        }}
      />

      {/* Send button */}
      <button
        id="chat-send-button"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200 active:scale-90"
        style={{
          background:
            disabled || !value.trim()
              ? "var(--chat-text-muted)"
              : "var(--chat-accent)",
          opacity: disabled || !value.trim() ? 0.3 : 1,
          cursor: disabled || !value.trim() ? "not-allowed" : "pointer",
        }}
        aria-label="Send message"
      >
        {/* Send arrow icon */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
}
