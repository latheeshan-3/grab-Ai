import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Medical Booking Assistant",
  description:
    "AI-powered booking assistant for medical center appointments. Chat with our assistant to schedule, reschedule, or inquire about medical services.",
};

export default function ChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="h-full w-full" style={{ background: "var(--chat-bg)" }}>
      {children}
    </div>
  );
}
