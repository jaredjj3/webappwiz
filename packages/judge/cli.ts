#!/usr/bin/env bun
import { ConsoleLogger } from "@webappwiz/log";
import { NodeFs, NodePs } from "@webappwiz/sys";
import { Check } from "./check";

// Runs the checked half of judge.config.ts, the half no agent is needed for.
// The rules it cannot decide are `webappwiz judge`'s, on demand.
const ok = await new Check(
	new ConsoleLogger(),
	new NodeFs(),
	new NodePs(),
).run();
if (!ok) {
	process.exit(1);
}
