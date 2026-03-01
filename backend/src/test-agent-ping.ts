/**
 * Minimal script: only dotenv + write file. Run: npx tsc && node dist/test-agent-ping.js
 * If test-agent-output.txt appears with "ping", Node/tsc/cwd work; the hang is in viem or RPC.
 */
import "dotenv/config.js";
import { writeFileSync } from "fs";

const OUT = "test-agent-out.txt";
writeFileSync(OUT, "ping " + new Date().toISOString() + " cwd=" + process.cwd() + "\n", "utf8");
process.stderr.write("ping: wrote " + OUT + "\n");
process.exit(0);
