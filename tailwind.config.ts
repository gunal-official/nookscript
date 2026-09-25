import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // User-specified shell bands (Step 33): mobile <600, tablet 600–1023,
      // desktop ≥1024. Named screens so shell code reads `tab:` / `desk:`.
      screens: { tab: "600px", desk: "1024px" },
      colors: {
        // Raw design tokens (CSS variables defined in app/globals.css).
        // Step 34 retuned to the ui.webp language: warm gray backdrop, white
        // cards, vivid orange accent, near-black ink.
        bg: "var(--bg)",
        text: "var(--text)",
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "#ffffff",
          soft: "var(--accent-soft)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--text)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "color-mix(in srgb, var(--text) 52%, transparent)",
        },
        border: "var(--border)",
        error: "var(--error)",
        success: {
          DEFAULT: "var(--success)",
          soft: "var(--success-soft)",
        },
        dark: {
          DEFAULT: "var(--dark)",
          foreground: "#ffffff",
        },
        // shadcn-style semantic aliases mapped onto the design tokens
        background: "var(--bg)",
        foreground: "var(--text)",
        input: "var(--border)",
        ring: "var(--accent)",
        primary: {
          DEFAULT: "var(--accent)",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "var(--card)",
          foreground: "var(--text)",
        },
        destructive: {
          DEFAULT: "var(--error)",
          foreground: "#ffffff",
        },
        popover: {
          DEFAULT: "var(--card)",
          foreground: "var(--text)",
        },
      },
      borderRadius: {
        // --radius = 0.625rem (inputs/buttons); lg doubles to 20px cards —
        // the ui.webp scale. Pills use rounded-full in components.
        lg: "calc(var(--radius) * 2)", // 1.25rem — card-level containers
        md: "var(--radius)",
        DEFAULT: "var(--radius)",
        sm: "calc(var(--radius) / 2)",
      },
      boxShadow: {
        // Soft elevation language from ui.webp: hairline + wide low shadow.
        card: "0 1px 2px rgb(21 21 24 / 0.04), 0 12px 32px -16px rgb(21 21 24 / 0.10)",
        pop: "0 8px 30px -6px rgb(21 21 24 / 0.14)",
        rail: "0 1px 2px rgb(21 21 24 / 0.05)",
      },
      fontFamily: {
        // Plus Jakarta Sans self-hosted via @fontsource-variable (no build-time
        // fetch): display headings, numbers, brand. Inter stays the body face.
        display: [
          "var(--font-display)",
          "Plus Jakarta Sans",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        sans: [
          "var(--font-inter)",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
