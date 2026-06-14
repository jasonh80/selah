import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { VersionProvider } from "@/components/VersionProvider";
import { ReadingModeProvider } from "@/components/ReadingModeProvider";
import { BUILD_ID } from "@/lib/build";

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
    "Your daily Bible chapter, made visual, simple, and personal. Pause. Reflect. Elevate.",
  other: { "selah-build": BUILD_ID },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="starlight"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable}`}
    >
      <head>
        {/* Apply saved theme (else Starlight) before paint — no flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('selah-theme')||'starlight';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();",
          }}
        />
      </head>
      <body className="theme-transition">
        <ThemeProvider>
          <VersionProvider>
            <ReadingModeProvider>{children}</ReadingModeProvider>
          </VersionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
