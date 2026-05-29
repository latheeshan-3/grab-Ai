import { redirect } from "next/navigation";

export default function Home() {
  // Redirect root visitors to the chat interface
  // You can optionally add a default tenant_id here for testing, e.g. redirect("/chat?tenant_id=demo")
  redirect("/chat");
}
