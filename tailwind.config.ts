import type { Config } from "tailwindcss";

// Neo-brutalist light theme: cream paper, ink outlines, hard shadows, flat colour blocks (docs/DESIGN.md §2).
// Hex literals so opacity modifiers work (bg-surface/80). Keep in sync with app/globals.css and lib/ui/tokens.ts.
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "./lib/ui/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#FFF7E8", surface: "#FFFFFF", surface2: "#FFF1D6", border: "#111111", borderStrong: "#111111",
        text: "#111111", muted: "#5B5566", faint: "#9A93A6", ink: "#111111", cream: "#FFF7E8",
        accent: "#FFD23F", accentStrong: "#FFC400", danger: "#FF5A5F", ok: "#3DDC97", pink: "#FF6FAE", blue: "#4DA3FF",
        goal: "#FFD23F", session: "#A78BFA", person: "#FF8C42", booth: "#3DDC97", moment: "#111111", other: "#4DA3FF", conf: "#B8B2C2",
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        hand: ["var(--font-hand)", "cursive"],
      },
      boxShadow: { hard: "4px 4px 0 #111", hardSm: "2px 2px 0 #111", hardLg: "6px 6px 0 #111" },
      borderRadius: { md: "10px", lg: "14px", xl: "16px" },
      transitionDuration: { fast: "150ms", sheet: "250ms" },
      keyframes: {
        pulseRing: { "0%": { boxShadow: "0 0 0 0 rgba(255,210,63,0.9)" }, "100%": { boxShadow: "0 0 0 10px rgba(255,210,63,0)" } },
        fadeIn: { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { pulseRing: "pulseRing 900ms ease-out 2", fadeIn: "fadeIn 200ms ease-out" },
    },
  },
  plugins: [],
};
export default config;
