import type { Config } from "tailwindcss";

/** Swipe brand: green on mint, navy ink, Bricolage Grotesque + Inter. */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        brand: { 50: "#E6F7F0", 100: "#C9EEDF", 400: "#1FC48D", 500: "#00875A", 600: "#00714B", 700: "#005C3D" },
        swipe: { DEFAULT: "#00B37A", deep: "#00875A" },
        navy: { DEFAULT: "#0F1724", 700: "#1E2836", 500: "#5B6B75" },
        mint: { DEFAULT: "#F4F8F7", line: "#D8E6E1" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["'Bricolage Grotesque'", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "14px", "2xl": "20px" },
      boxShadow: { card: "0 1px 2px rgba(15,23,36,.04), 0 8px 24px -12px rgba(15,23,36,.08)", btn: "0 8px 16px -6px rgba(0,179,122,.35)" },
    },
  },
  plugins: [],
} satisfies Config;
