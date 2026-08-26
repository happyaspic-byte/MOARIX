#!/usr/bin/env node

import { runCli } from "../src/lib/cli/program.mjs";

process.exitCode = await runCli(process.argv.slice(2));
