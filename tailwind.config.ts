import type { Config } from "tailwindcss";

// Colours are hex literals so opacity modifiers work (bg-ink/72). Keep in sync with lib/ui/tokens.ts and globals.css.
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "./lib/ui/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abyss: "#05071A", ink: "#0E1433", nebula: "#1C2452", hairline: "#2A3366",
        star: "#F2F0FF", dust: "#8C93B8",
        polaris: "#A78BFA", sun: "#FFC861", ember: "#FF8A5B", aurora: "#5EEAA8",
        comet: "#5CE1E6", moment: "#FFFFFF", flare: "#FF6B8B",
      },
      opacity: { 72: "0.72" }, // bg-ink/72 (sheets)
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-caslon-display)", "serif"],
        name: ["var(--font-caslon-text)", "serif"], // always with `italic`
      },
      fontSize: {
        "display-xl": ["44px", { lineHeight: "48px", fontWeight: "400" }],
        display: ["30px", { lineHeight: "36px", fontWeight: "400" }],
        title: ["20px", { lineHeight: "26px", fontWeight: "600" }],
        body: ["16px", { lineHeight: "24px", fontWeight: "400" }],
        meta: ["14px", { lineHeight: "20px", fontWeight: "450" }],
        micro: ["12px", { lineHeight: "16px", fontWeight: "500" }],
      },
      borderRadius: { card: "18px", sheet: "28px", input: "14px" },
      transitionDuration: { tap: "120ms", sheet: "320ms", light: "900ms", fly: "1100ms" },
      transitionTimingFunction: { expo: "cubic-bezier(0.16, 1, 0.3, 1)", trace: "cubic-bezier(0.65, 0, 0.35, 1)" },
      keyframes: { ring: { "0%": { transform: "scale(1)", opacity: "0.8" }, "100%": { transform: "scale(4)", opacity: "0" } } },
      animation: { ring: "ring 900ms cubic-bezier(0.16, 1, 0.3, 1) forwards" }, // capture tile flare (#14)
    },
  },
  plugins: [],
};
export default config;
