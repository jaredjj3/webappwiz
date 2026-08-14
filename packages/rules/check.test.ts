import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { NodeGlob } from "@webappwiz/sys";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";
import { Check } from "./check";
import { OneClassPerFile } from "./rule/one-class-per-file";

const oneClass = new OneClassPerFile();

describe("check", () => {
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

		expect(await new Check(log, fs, ps, new NodeGlob(), [oneClass]).run()).toBe(
			true,
		);
		expect(ps.getCalls()).toEqual(["git ls-files"]);
		expect(log.entries).toHaveLength(0);
	});

	it("reports each finding and fails on an error", async () => {
		ps.setCaptureOutput("a.ts\n", "");
		await fs.write("a.ts", "class A {}\nclass B {}\n");

		expect(await new Check(log, fs, ps, new NodeGlob(), [oneClass]).run()).toBe(
			false,
		);
		expect(log.entries).toHaveLength(1);
		expect(String(log.entries[0]?.message)).toContain("a.ts:2:1");
	});

	it("never reads a file no rule wants", async () => {
		ps.setCaptureOutput("a.png\n", "");

		expect(await new Check(log, fs, ps, new NodeGlob(), [oneClass]).run()).toBe(
			true,
		);
	});

	it("refuses to run outside a git repository", async () => {
		ps.exit(1);

		await expect(
			new Check(log, fs, ps, new NodeGlob(), [oneClass]).run(),
		).rejects.toThrow("git ls-files");
	});
});
