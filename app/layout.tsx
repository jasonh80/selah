import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Selah — your daily Bible chapter",
  description:
    "Your daily Bible chapter, made visual, simple, and personal. Pause. Reflect. Lift up.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="air" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="theme-transition">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
