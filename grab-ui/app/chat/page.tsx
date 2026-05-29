"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ChatMessage from "./components/ChatMessage";
import TypingIndicator from "./components/TypingIndicator";
import ChatInput from "./components/ChatInput";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: string;
}

interface ChatApiResponse {
  tenant_id: string;
  conversation_id: string;
  reply: string;
  timestamp: string;
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// -------------------------------------------------------------------
// Main Chat Component (reads search params)
// -------------------------------------------------------------------

function ChatContent() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenant_id") || "";

  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Initialize conversation and welcome message on mount
  useEffect(() => {
    setConversationId(generateId());
    
    const welcome: Message = {
      id: generateId(),
      text: "👋 Welcome! I'm your medical booking assistant. I can help you schedule appointments, find available doctors, and manage your bookings. How can I help you today?",
      sender: "bot",
      timestamp: formatTime(),
    };
    setMessages([welcome]);
    setMounted(true);
  }, []);


  // Send message to API
  const handleSend = useCallback(
    async (text: string) => {
      if (!tenantId) return;

      // Add user message
      const userMsg: Message = {
        id: generateId(),
        text,
        sender: "user",
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const res = await fetch(`${API_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_id: tenantId,
            conversation_id: conversationId,
            message: text,
          }),
        });

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        const data: ChatApiResponse = await res.json();

        // Ensure conversationId stays in sync with server
        if (data.conversation_id) {
          setConversationId(data.conversation_id);
        }

        const botMsg: Message = {
          id: generateId(),
          text: data.reply,
          sender: "bot",
          timestamp: formatTime(data.timestamp),
        };
        setMessages((prev) => [...prev, botMsg]);
      } catch (err) {
        const errorMsg: Message = {
          id: generateId(),
          text: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
          sender: "bot",
          timestamp: formatTime(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        console.error("Chat API error:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [tenantId, conversationId]
  );

  // Avoid hydration mismatch by not rendering until mounted
  if (!mounted) {
    return null;
  }

  // ---------------------------------------------------------------
  // No tenant_id — show error state
  // ---------------------------------------------------------------
  if (!tenantId) {
    return (
      <div
        className="flex h-dvh w-full flex-col items-center justify-center gap-4 px-6"
        style={{ background: "var(--chat-bg)", color: "var(--chat-text-primary)" }}
      >
        <div className="text-5xl">🏥</div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--chat-text-primary)" }}>
          Missing Medical Center
        </h1>
        <p
          className="text-center text-sm leading-relaxed max-w-sm"
          style={{ color: "var(--chat-text-secondary)" }}
        >
          Please scan the QR code at your medical center to start a booking
          conversation. The QR code contains the center&apos;s unique identifier
          needed to connect you with the right assistant.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // Chat UI
  // ---------------------------------------------------------------
  return (
    <div
      className="flex h-dvh w-full flex-col"
      style={{ background: "var(--chat-bg)" }}
    >
      {/* ========== HEADER ========== */}
      <header
        className="flex shrink-0 items-center gap-3 px-4 py-3"
        style={{
          background: "var(--chat-surface)",
          borderBottom: "1px solid var(--chat-border)",
        }}
      >
        {/* Logo / icon */}
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
          style={{
            background: "var(--chat-accent-glow)",
            color: "var(--chat-accent-light)",
          }}
        >
          🏥
        </div>

        <div className="flex flex-1 flex-col">
          <h1
            className="text-sm font-semibold"
            style={{ color: "var(--chat-text-primary)" }}
          >
            Medical Assistant
          </h1>
          <div className="flex items-center gap-1.5">
            <span
              className="status-pulse inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--chat-success)" }}
            />
            <span
              className="text-[11px]"
              style={{ color: "var(--chat-text-muted)" }}
            >
              Online • Ready to help
            </span>
          </div>
        </div>

        {/* Session info pill */}
        <div
          className="hidden sm:flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono"
          style={{
            background: "var(--chat-accent-glow)",
            color: "var(--chat-accent-light)",
          }}
        >
          <span className="opacity-60">ID:</span>
          <span>{conversationId.slice(0, 8)}</span>
        </div>
      </header>

      {/* ========== MESSAGES AREA ========== */}
      <main
        className="chat-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6"
        id="chat-messages"
      >
        {/* Subtle date divider */}
        <div className="flex items-center justify-center">
          <span
            className="rounded-full px-3 py-1 text-[10px] font-medium"
            style={{
              background: "var(--chat-surface)",
              color: "var(--chat-text-muted)",
              border: "1px solid var(--chat-border)",
            }}
          >
            Today
          </span>
        </div>

        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg.text}
            sender={msg.sender}
            timestamp={msg.timestamp}
          />
        ))}

        {isLoading && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </main>

      {/* ========== INPUT BAR ========== */}
      <footer
        className="shrink-0 px-4 pb-6 pt-2"
        style={{
          background: "var(--chat-bg)",
          borderTop: "1px solid var(--chat-border)",
        }}
      >
        <ChatInput onSend={handleSend} disabled={isLoading} />

        <p
          className="mt-2 text-center text-[10px]"
          style={{ color: "var(--chat-text-muted)" }}
        >
          Powered by AI • Your medical data is private and secure
        </p>
      </footer>
    </div>
  );
}

// -------------------------------------------------------------------
// Page export with Suspense boundary (required for useSearchParams)
// -------------------------------------------------------------------

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex h-dvh w-full items-center justify-center"
          style={{ background: "var(--chat-bg)", color: "var(--chat-text-secondary)" }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "var(--chat-accent)", borderTopColor: "transparent" }}
            />
            <span className="text-sm">Loading chat...</span>
          </div>
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
