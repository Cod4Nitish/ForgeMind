import { existsSync } from "node:fs";

// Live tests read the same local secrets file Next.js uses.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
