import type { Config } from "tailwindcss";

/** "Broadcast control room": ink-green console, sage canvas, teal working colour, signal yellow for on-air. */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        ink: { 950: "#08130F", 900: "#0E1F1B", 800: "#152B26", 700: "#1E3832", 600: "#2B4A43", 400: "#7F9891", 300: "#A9BCB6", 100: "#E4ECE9" },
        brand: { 50: "#E7F4F1", 400: "#2A9C8B", 500: "#127A6B", 600: "#0E6357" },
        signal: { 300: "#FFE08A", 400: "#FFD35C", 500: "#FFC93C", 600: "#E8AE12" },
      },
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["'Bricolage Grotesque'", "Geist", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
    },
  },
  plugins: [],
} satisfies Config;
