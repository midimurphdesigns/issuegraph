import type { Metadata } from "next";
import { Space_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
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
      <body className={`${spaceGrotesk.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
