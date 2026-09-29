import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chain Sentry — Decentralized AI Surveillance & Tamper-Evident Evidence Network",
  description:
    "See the incident. Prove the evidence. Trust the chain. AI incident detection, SHA-256 evidence hashing, MST blockchain anchoring, live WebSocket telemetry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
