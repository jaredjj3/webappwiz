import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";
import { Lint } from "./lint";
import { compile, type Rule } from "./rule";
import { oneClassPerFile } from "./rules/one-class-per-file";
import { ruleDoc } from "./testing";

const oneClass = ((): Rule => {
	const out = compile(ruleDoc("One class"), "one-class.md", {
		check: oneClassPerFile,
	});
	if (!out.rule) {
		throw new Error("fixture rule failed to compile");
	}
	return out.rule;
})();

describe("lint", () => {
	let log: MemoryLogger;
	let fs: FakeFs;
	let ps: FakePs;

	beforeEach(() => {
		log = new MemoryLogger();
		fs = new FakeFs();
		ps = new FakePs();
	});

	it("passes a clean repository silently", async () => {
		ps.setCaptureOutput("a.ts\n", "");
		await fs.write("a.ts", "export class A {}\n");

		expect(await new Lint(log, fs, ps, [oneClass]).run()).toBe(true);
		expect(ps.getCalls()).toEqual(["git ls-files"]);
		expect(log.entries).toHaveLength(0);
	});

	it("reports each finding and fails on an error", async () => {
		ps.setCaptureOutput("a.ts\n", "");
		await fs.write("a.ts", "class A {}\nclass B {}\n");

		expect(await new Lint(log, fs, ps, [oneClass]).run()).toBe(false);
		expect(log.entries).toHaveLength(1);
		expect(String(log.entries[0]?.message)).toContain("a.ts:2:1");
	});

	it("never reads a file no rule wants", async () => {
		ps.setCaptureOutput("a.png\n", "");

		expect(await new Lint(log, fs, ps, [oneClass]).run()).toBe(true);
	});

	it("refuses to run outside a git repository", async () => {
		ps.exit(1);

		await expect(new Lint(log, fs, ps, [oneClass]).run()).rejects.toThrow(
			"git ls-files",
		);
	});

	it("fails reporting the guide when its rules will not load", async () => {
		// No lint.config.ts in this fake fs, and the recommended rules' files
		// are not in it either: the fallback guide cannot compile.
		expect(await new Lint(log, fs, ps).run()).toBe(false);
		expect(String(log.entries[0]?.message)).toContain("cannot read rule file");
	});
});
