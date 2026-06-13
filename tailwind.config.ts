import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Theme-driven (swap via [data-theme])
        background: "var(--background)",
        card: "var(--card)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        accent: "var(--accent)",
        "accent-strong": "var(--accent-strong)",
        tint: "var(--tint)",
        line: "var(--line)",
        // Constant brand
        purple: "var(--selah-purple)",
        "almost-black": "var(--almost-black)",
        "jesus-red": "var(--jesus-red)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
      },
      maxWidth: { page: "1120px" },
      borderRadius: { card: "20px" },
      boxShadow: {
        card: "0 1px 2px rgba(16,16,20,0.04), 0 8px 24px rgba(16,16,20,0.05)",
        soft: "0 1px 3px rgba(16,16,20,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
