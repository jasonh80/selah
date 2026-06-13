import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Theme-driven (swap via [data-theme])
        background: "var(--background)",
        card: "var(--card)",
        "card-soft": "var(--card-soft)",
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
        "jesus-red-soft": "var(--jesus-red-soft)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
      },
      maxWidth: { page: "1120px", app: "540px" },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        card: "20px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        soft: "var(--shadow-soft)",
        hair: "0 1px 3px rgba(16,16,20,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
