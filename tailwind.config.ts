import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: { extend: {
    colors: { ink: { 950: "#0b0d12", 900: "#11141b", 800: "#181c25", 700: "#232836", 600: "#2f3547", 400: "#7c849a", 300: "#a3aabd", 100: "#e7e9ef" },
              brand: { 500: "#6d5efc", 600: "#5a4bf0", 400: "#8b80ff", 50: "#f0eeff" } },
    fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
  } },
  plugins: [],
} satisfies Config;
