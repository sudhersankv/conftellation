import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach twMerge the custom font sizes/radii so text-meta and text-dust don't collide.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display-xl", "display", "title", "body", "meta", "micro"] }],
      rounded: [{ rounded: ["card", "sheet", "input"] }],
      "rounded-t": [{ "rounded-t": ["card", "sheet", "input"] }],
    },
  },
});
export const cn = (...c: ClassValue[]) => twMerge(clsx(c));
