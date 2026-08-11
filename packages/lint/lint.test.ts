import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";
import { Lint } from "./lint";

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

		expect(await new Lint(log, fs, ps).run()).toBe(true);
		expect(ps.getCalls()).toEqual(["git ls-files"]);
		expect(log.entries).toHaveLength(0);
	});

	it("reports each finding and fails on an error", async () => {
		ps.setCaptureOutput("a.ts\n", "");
		await fs.write("a.ts", "class A {}\nclass B {}\n");

		expect(await new Lint(log, fs, ps).run()).toBe(false);
		expect(log.entries).toHaveLength(1);
		expect(String(log.entries[0]?.message)).toContain("a.ts:2:1");
	});

	it("never reads a file no rule wants", async () => {
		ps.setCaptureOutput("a.png\n", "");

		expect(await new Lint(log, fs, ps).run()).toBe(true);
	});

	it("refuses to run outside a git repository", async () => {
		ps.exit(1);

		await expect(new Lint(log, fs, ps).run()).rejects.toThrow("git ls-files");
	});
});
