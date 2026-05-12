import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { getThemeFromCookie } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leyton Arena",
  description: "Gamified leaderboard for Leyton R&D tax consultants.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = getThemeFromCookie();
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${theme}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
        <Toaster theme={theme} richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
