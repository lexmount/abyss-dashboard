#!/usr/bin/env node

import { runCli } from "../server/cli.mjs";

try {
  await runCli();
} catch (error) {
  console.error(`abyss-dashboard: ${error.message}`);
  process.exitCode = 1;
}
