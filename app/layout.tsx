import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ForgeMind",
  description: "AI Software Engineer agent for GitHub, Jira and Slack workflows.",
};

export const viewport: Viewport = {
  // sRGB hex of `--background` (oklch(0.165 0.012 255)) in app/globals.css. The
  // browser chrome needs a literal color; this is the only raw color outside
  // globals.css — keep the two in sync.
  themeColor: "#0b0f14",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
