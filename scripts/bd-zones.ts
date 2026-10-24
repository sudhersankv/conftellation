// npx tsx scripts/bd-zones.ts [--create]: list active Bright Data zones; with --create, add the Unlocker + SERP zones we use.
import "../seed/env";

const API = "https://api.brightdata.com";
const headers = { Authorization: `Bearer ${process.env.BRIGHTDATA_API_KEY}`, "Content-Type": "application/json" };

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
  return res.ok;
}

async function main() {
  await call("GET", "/zone/get_active_zones");
  if (process.argv.includes("--create")) {
    await call("POST", "/zone", { zone: { name: "conftellations_unlocker", type: "unblocker" }, plan: { type: "unblocker" } });
    await call("POST", "/zone", { zone: { name: "conftellations_serp", type: "serp" }, plan: { type: "unblocker", serp: true } });
    await call("GET", "/zone/get_active_zones");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
