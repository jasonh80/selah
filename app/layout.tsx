import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Selah — your daily Bible chapter",
  description:
    "Your daily Bible chapter, made visual, simple, and personal. Learn more. Dive deeper. Grow closer to Jesus.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="air" className={`${inter.variable} ${newsreader.variable}`}>
      <body className="theme-transition">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
