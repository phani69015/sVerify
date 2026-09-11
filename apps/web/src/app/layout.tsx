import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "sVerify — Social Media Content Verification",
  description: "Paste a public Facebook, Instagram, or X post URL to verify it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
