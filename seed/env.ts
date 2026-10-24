// Imported first by CLI scripts so .env.local is loaded before lib/falkor reads FALKORDB_GRAPH.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
