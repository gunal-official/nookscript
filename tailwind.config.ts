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
      colors: {
        // Raw design tokens (CSS variables defined in app/globals.css)
        bg: "var(--bg)",
        text: "var(--text)",
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "#ffffff",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--text)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "color-mix(in srgb, var(--text) 55%, transparent)",
        },
        border: "var(--border)",
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
          DEFAULT: "#b91c1c",
          foreground: "#ffffff",
        },
        popover: {
          DEFAULT: "var(--card)",
          foreground: "var(--text)",
        },
      },
      borderRadius: {
        lg: "calc(var(--radius) * 2)", // 0.7rem — card-level containers
        md: "var(--radius)",
        DEFAULT: "var(--radius)",
        sm: "calc(var(--radius) / 2)",
      },
      fontFamily: {
        display: ["Georgia", "Times New Roman", "serif"],
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
