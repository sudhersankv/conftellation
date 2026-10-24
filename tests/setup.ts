import { config } from "dotenv";
config({ path: ".env.local" });
// Integration tests never touch the demo graph.
process.env.FALKORDB_GRAPH = `${process.env.FALKORDB_GRAPH ?? "conftellations"}_test`;
