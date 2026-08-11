#!/usr/bin/env bun
import { ConsoleLogger } from "@webappwiz/log";
import { NodeFs, NodePs } from "@webappwiz/sys";
import { Lint } from "./lint";
import type { Rule } from "./rule";
import { recommended } from "./rules";

// A lint.config.ts at the repository root replaces the recommended set, the
// way any linter's config does: `export default [...recommended, myRule]`.
async function rules(fs: NodeFs): Promise<Rule[]> {
	const path = `${process.cwd()}/lint.config.ts`;
	if (!(await fs.exists(path))) {
		return recommended;
	}
	return (await import(path)).default;
}

const fs = new NodeFs();
const ok = await new Lint(
	new ConsoleLogger(),
	fs,
	new NodePs(),
	await rules(fs),
).run();
if (!ok) {
	process.exit(1);
}
