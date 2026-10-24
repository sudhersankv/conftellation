import type { Config } from "tailwindcss";

// Neutral dark theme, one accent, type colours only for node/type coding (docs/DESIGN.md §2).
// Hex literals so opacity modifiers work (bg-surface/80). Keep in sync with app/globals.css and lib/ui/tokens.ts.
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "./lib/ui/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0B12", surface: "#14141D", surface2: "#1B1B27", border: "#272735", borderStrong: "#353548",
        text: "#EDEDF2", muted: "#8E8EA3", faint: "#5C5C70",
        accent: "#8B7CF6", accentStrong: "#A496FF", danger: "#F26B6B", ok: "#4FD1A0",
        goal: "#F2C14E", session: "#8B7CF6", person: "#F28B5B", booth: "#4FD1A0", moment: "#FFFFFF", other: "#4FC3D9", conf: "#8E8EA3",
      },
      fontFamily: { sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"] },
      borderRadius: { md: "8px", lg: "10px", xl: "14px" },
      transitionDuration: { fast: "150ms", sheet: "250ms" },
      keyframes: {
        pulseRing: { "0%": { boxShadow: "0 0 0 0 rgba(139,124,246,0.6)" }, "100%": { boxShadow: "0 0 0 10px rgba(139,124,246,0)" } },
        fadeIn: { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { pulseRing: "pulseRing 900ms ease-out 2", fadeIn: "fadeIn 200ms ease-out" },
    },
  },
  plugins: [],
};
export default config;
