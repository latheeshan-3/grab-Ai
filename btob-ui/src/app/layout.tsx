import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grab My Seat – Central Booking Hub for All Services",
  description:
    "The unified, white-label central booking platform for medical centers, salons & spas, parkings, restaurants, personal meetings, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
