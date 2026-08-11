#!/usr/bin/env bun
import { ConsoleLogger } from "@webappwiz/log";
import { NodeFs, NodePs } from "@webappwiz/sys";
import { Lint } from "./lint";

// A lint.config.ts at the repository root replaces the recommended rules, the
// way any linter's config does: `export default defineGuide([...recommended])`.
const ok = await new Lint(
	new ConsoleLogger(),
	new NodeFs(),
	new NodePs(),
).run();
if (!ok) {
	process.exit(1);
}
