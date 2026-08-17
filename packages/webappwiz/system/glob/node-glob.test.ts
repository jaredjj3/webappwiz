import { describe, expect, it } from "bun:test";

import { NodeGlob } from "./node-glob";

describe("NodeGlob", () => {
	const glob = new NodeGlob();

	it("matches a path at any depth under a globstar", () => {
		expect(glob.matches("**/*.ts", "a/b/c.ts")).toBe(true);
		expect(glob.matches("**/*.ts", "c.ts")).toBe(true);
	});

	// the distinction the judge's rules lean on: `*` stops at a separator, so a
	// rule scoped to one directory does not quietly cover the tree below it
	it("stops a single star at a separator", () => {
		expect(glob.matches("*.ts", "a/b/c.ts")).toBe(false);
		expect(glob.matches("*.ts", "c.ts")).toBe(true);
	});

	it("matches only the extension the pattern names", () => {
		expect(glob.matches("**/*.ts", "a/b/c.tsx")).toBe(false);
		expect(glob.matches("**/*.{ts,tsx}", "a/b/c.tsx")).toBe(true);
	});

	it("anchors a pattern that leads with a directory", () => {
		expect(
			glob.matches("packages/**/*.ts", "packages/system/glob/glob.ts"),
		).toBe(true);
		expect(glob.matches("packages/**/*.ts", "bin/system/glob.ts")).toBe(false);
	});
});
