import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://anchorscout.vercel.app"),
  title: "AnchorScout — Compare Stellar routes",
  description:
    "Compare transparent Stellar payment routes, sign from your wallet, and verify settlement on-chain.",
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    apple: "/logo.png",
  },
  openGraph: {
    title: "AnchorScout — Compare Stellar routes",
    description: "Compare transparent Stellar payment routes and verify settlement on-chain.",
    images: [{ url: "/logo.png", alt: "AnchorScout" }],
  },
  twitter: {
    card: "summary",
    title: "AnchorScout — Compare Stellar routes",
    description: "Compare transparent Stellar payment routes and verify settlement on-chain.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
