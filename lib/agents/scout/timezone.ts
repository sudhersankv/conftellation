// Venue → IANA timezone. Table first (deterministic), then the LLM, then PT.
import { z } from "zod";
import { hasLLM, structured } from "@/lib/llm";
import { PT } from "@/lib/time";

const US: Record<string, string> = {
  CA: "America/Los_Angeles", WA: "America/Los_Angeles", OR: "America/Los_Angeles", NV: "America/Los_Angeles",
  UT: "America/Denver", CO: "America/Denver", NM: "America/Denver", MT: "America/Denver", WY: "America/Denver", ID: "America/Boise",
  AZ: "America/Phoenix",
  TX: "America/Chicago", IL: "America/Chicago", MN: "America/Chicago", MO: "America/Chicago", LA: "America/Chicago", TN: "America/Chicago", WI: "America/Chicago",
  NY: "America/New_York", MA: "America/New_York", GA: "America/New_York", FL: "America/New_York", DC: "America/New_York", VA: "America/New_York",
  NC: "America/New_York", PA: "America/New_York", NJ: "America/New_York", MD: "America/New_York", OH: "America/New_York", MI: "America/Detroit",
};
const STATE: Record<string, string> = {
  california: "CA", washington: "WA", oregon: "OR", nevada: "NV", utah: "UT", colorado: "CO", arizona: "AZ", texas: "TX",
  illinois: "IL", "new york": "NY", massachusetts: "MA", georgia: "GA", florida: "FL", "district of columbia": "DC",
};
const CITY: Record<string, string> = {
  "san francisco": "America/Los_Angeles", "los angeles": "America/Los_Angeles", "san jose": "America/Los_Angeles", seattle: "America/Los_Angeles",
  "san diego": "America/Los_Angeles", "las vegas": "America/Los_Angeles", "salt lake city": "America/Denver", denver: "America/Denver",
  austin: "America/Chicago", chicago: "America/Chicago", "new york": "America/New_York", boston: "America/New_York", atlanta: "America/New_York",
  london: "Europe/London", paris: "Europe/Paris", berlin: "Europe/Berlin", amsterdam: "Europe/Amsterdam",
  bangalore: "Asia/Kolkata", bengaluru: "Asia/Kolkata", tokyo: "Asia/Tokyo", singapore: "Asia/Singapore", toronto: "America/Toronto",
  "hong kong": "Asia/Hong_Kong", sydney: "Australia/Sydney",
};

export const isIana = (tz?: string | null): tz is string => {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export async function venueTimeZone(v: { city?: string; region?: string; country?: string; hint?: string | null }): Promise<string> {
  if (isIana(v.hint)) return v.hint;
  const region = v.region?.trim();
  const code = region && (region.length === 2 ? region.toUpperCase() : STATE[region.toLowerCase()]);
  if (code && US[code]) return US[code];
  const city = v.city?.trim().toLowerCase();
  if (city && CITY[city]) return CITY[city];
  if ((city || region || v.country) && hasLLM()) {
    try {
      const { timezone } = await structured(
        z.object({ timezone: z.string() }),
        "Return the IANA timezone (e.g. America/Denver) of the given venue location.",
        [v.city, v.region, v.country].filter(Boolean).join(", "),
        "timezone",
      );
      if (isIana(timezone)) return timezone;
    } catch {
      // fall through
    }
  }
  return PT;
}
