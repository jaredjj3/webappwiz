import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Decisions } from "@webappwiz/scry";
import { color, MemoryLogger } from "webappwiz/log";
import { NodeFs, NodePs } from "webappwiz/system";
import { FakeProcess } from "webappwiz/system/testing";
import { DECISIONS } from "./project-decider";
import { why } from "./why";

describe("wiz scry why", () => {
	const fs = new NodeFs();
	const text = "// add one\nconst a = 1;\n";
	let root: string;
	let proc: FakeProcess;
	let ps: NodePs;
	let log: MemoryLogger;

	const printed = () =>
		log.entries.map((entry) => color.strip(String(entry.message)));

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "scry-why-"));
		proc = new FakeProcess();
		proc.env = { PATH: process.env.PATH, HOME: root };
		ps = new NodePs({ proc });
		proc.chdir(root);
		log = new MemoryLogger();
		await ps.spawnCapture(["git", "-C", root, "init", "-q"]);
		await fs.mkdir(`${root}/src`);
		await fs.write(`${root}/src/a.ts`, text);
		const decisions = await Decisions.open(`${root}/${DECISIONS}`, { fs });
		decisions.put("key", {
			question: "Does it restate the code?",
			path: "src/a.ts",
			line: 1,
			probability: 0.87,
			model: "clef",
			file: Decisions.fingerprint(text),
			at: "2026-10-04T12:00:00.000Z",
		});
		await decisions.save();
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("prints what the model was asked about the line, and what it answered", async () => {
		await why({ at: "src/a.ts:1", log, fs, ps });

		expect(printed()).toEqual([
			"87%  Does it restate the code?  clef, 2026-10-04T12:00:00.000Z",
		]);
	});

	it("reads the path from the working directory", async () => {
		proc.chdir(`${root}/src`);

		await why({ at: "a.ts:1", log, fs, ps });

		expect(printed()).toEqual([
			"87%  Does it restate the code?  clef, 2026-10-04T12:00:00.000Z",
		]);
	});

	it("says code decided a line no model was asked about", async () => {
		await why({ at: "src/a.ts:2", log, fs, ps });

		expect(printed()).toEqual([
			"no model was asked about src/a.ts:2 as it reads now: whatever a rule found there, its code decided",
		]);
	});

	it("forgets what was asked about the file before it changed", async () => {
		await fs.write(`${root}/src/a.ts`, "// add two\nconst a = 2;\n");

		await why({ at: "src/a.ts:1", log, fs, ps });

		expect(printed()).toEqual([
			"no model was asked about src/a.ts:1 as it reads now: whatever a rule found there, its code decided",
		]);
	});

	it("wants a line", async () => {
		await expect(why({ at: "src/a.ts", log, fs, ps })).rejects.toThrow(
			'expected path:line, like src/cart.ts:12, got "src/a.ts"',
		);
	});
});
