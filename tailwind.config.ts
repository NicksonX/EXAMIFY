import type { Config } from "tailwindcss";

// Every product section uses Examify's editorial palette. Dashboard and Exam
// keep their focused layouts, not a separate green visual system.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#14274A", soft: "#34507C", lighter: "#6C7D9C" },
        accent: {
          DEFAULT: "#CE4040",
          hover: "#A92E31",
          soft: "#F8E7E2",
          ink: "#8A2C2E",
        },
        gold: {
          DEFAULT: "#CE4040",
          soft: "#F8E7E2",
          ink: "#8A2C2E",
        },
        canvas: "#F7F2E9",
        surface: "#FFFDFA",
        line: "#D9D1C2",
        success: { DEFAULT: "#1F5375", soft: "#E3EEF5" },
      },
      fontFamily: {
        display: ["'Cormorant Garamond'", "Georgia", "serif"],
        sans: ["'Manrope'", "system-ui", "sans-serif"],
        "editorial-display": ["'Cormorant Garamond'", "Georgia", "serif"],
        "editorial-sans": ["'Manrope'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 42px -30px rgba(28,41,36,0.22)",
        pop: "0 22px 48px -28px rgba(37,122,88,0.46)",
      },
    },
  },
  plugins: [],
} satisfies Config;
