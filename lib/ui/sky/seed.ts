export { hashSeed as hash, mulberry32 as rng } from "@/lib/ui/rand";
import { hashSeed } from "@/lib/ui/rand";

export const phase = (id: string) => (hashSeed(id) % 6283) / 1000;
export const period = (id: string) => 3000 + (hashSeed(id + "p") % 3000);
export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
