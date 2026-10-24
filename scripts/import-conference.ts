// npx tsx scripts/import-conference.ts [url]  (same code path as POST /api/conferences, into FALKORDB_GRAPH)
import "../seed/env";
import { importConference } from "@/lib/agents/scout";

const url = process.argv[2] ?? "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/";

importConference(url).then(
  (r) => {
    const { conference, counts, cached } = r.response;
    console.log(`${process.env.FALKORDB_GRAPH}: ${conference.id} cached=${cached} path=${r.path ?? "-"} ${JSON.stringify(counts)} tz=${conference.timezone} ${r.ms} ms, Bright Data requests=${r.brightDataRequests}`);
    if (r.enrich) console.log(`sponsors enriched=${r.enrich.enriched} failed=${r.enrich.failed.join("; ") || 0}`);
    process.exit(0);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
