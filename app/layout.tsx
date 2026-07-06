import type { Metadata } from "next";
import { Space_Grotesk, Geist_Mono, Instrument_Serif } from "next/font/google";
import Cursor from "./Cursor";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

// Display tier — italic serif for >=32px display text only, matching the
// main site's type hierarchy (Migra falls through to Instrument Serif).
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "issuegraph — a LangGraph triage agent, live",
  description:
    "Watch a LangGraph state machine triage GitHub issues: classify, route, quality-guard, and pause for human approval when confidence is low.",
  metadataBase: new URL("https://issuegraph.kevinmurphywebdev.com"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
      >
        <div aria-hidden className="grain-overlay" />
        <Cursor />
        {children}
      </body>
    </html>
  );
}
