import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Judge } from "@webappwiz/scry";
import { FakeJudge, ruleDoc } from "@webappwiz/scry/testing";
import { color, MemoryLogger } from "webappwiz/log";
import { NodeFs, NodePs } from "webappwiz/system";
import { FakeProcess } from "webappwiz/system/testing";
import { evaluate } from "./evaluate";

describe("wiz scry eval", () => {
	const fs = new NodeFs();
	let root: string;
	let proc: FakeProcess;
	let ps: NodePs;
	let log: MemoryLogger;
	let judge: Judge;
	let asked: string[];
	const providers = {
		judge: async (model: string) => {
			asked.push(model);
			return judge;
		},
	};

	/** Says yes, at 0.7, to code holding ruleDoc's second class, and no to the rest. */
	const knowing: Judge = {
		judge: async (judgment) => ({
			answers: new Map(
				Object.keys(judgment.questions).map((id) => [
					id,
					String(judgment.state.file).includes("Bar") ? 0.7 : 0.1,
				]),
			),
		}),
	};

	const printed = () =>
		color.strip(
			log.entries
				.filter((entry) => entry.level === "info")
				.map((entry) => String(entry.message))
				.join("\n"),
		);

	const install = async (id: string, doc: string) => {
		await fs.mkdir(`${root}/.wiz/scry/${id}`);
		await fs.write(`${root}/.wiz/scry/${id}/RULE.md`, doc);
	};

	const run = (ids: string[] = [], model?: string) =>
		evaluate({ ids, model, format: "text", log, fs, ps, providers });

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "scry-eval-"));
		proc = new FakeProcess();
		proc.env = { PATH: process.env.PATH, HOME: root };
		ps = new NodePs({ proc });
		proc.chdir(root);
		log = new MemoryLogger();
		judge = knowing;
		asked = [];
		await ps.spawnCapture(["git", "-C", root, "init", "-q"]);
		await install("no-foo", ruleDoc("no-foo"));
		await install("strict", ruleDoc("strict", { threshold: 0.9 }));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("says how many of each rule's examples its model got right, and which it got wrong", async () => {
		await run();

		expect(printed()).toEqual(
			[
				"no-foo   medium   clef   2 of 2 right",
				"strict   medium   clef   1 of 2 right",
				"  ✖ RULE.md bad 1: 70%, under its 90% threshold",
				"",
				"✖ 3 of 4 examples judged right across 2 rules",
			].join("\n"),
		);
		expect(proc.exits).toEqual([]);
	});

	it("judges a rule's eval cases beside its examples", async () => {
		await fs.mkdir(`${root}/.wiz/scry/no-foo/evals`);
		await fs.write(
			`${root}/.wiz/scry/no-foo/evals/looks-fine.good.ts`,
			"class Bar {}\n",
		);

		await run(["no-foo"]);

		expect(printed()).toContain(
			"  ✖ evals/looks-fine.good.ts: 70%, at or over its 70% threshold",
		);
	});

	it("judges only the rules it is given, with the one model it is given", async () => {
		await run(["no-foo"], "jev-latest");

		expect(printed()).toEndWith("✔ 2 of 2 examples judged right across 1 rule");
		expect(asked).toEqual(["jev-latest"]);
	});

	it("refuses a rule the project does not have", async () => {
		await expect(run(["nope"])).rejects.toThrow(/^no rule nope in /);
	});

	it("names the examples its judge failed on, and exits 2", async () => {
		judge = new FakeJudge(new Error("down"));

		await run(["no-foo"]);

		expect(printed()).toContain("no-foo RULE.md good 1   down");
		expect(proc.exits).toEqual([2]);
	});
});
