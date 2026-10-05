import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Judge } from "@webappwiz/scry";
import { FakeJudge, ruleSource } from "@webappwiz/scry/testing";
import { color, MemoryLogger } from "webappwiz/log";
import { NodeFs, NodePs } from "webappwiz/system";
import { FakeProcess } from "webappwiz/system/testing";
import { FakeTimer } from "webappwiz/time/testing";
import { evaluate } from "./eval";
import type { Screen } from "./screen";

describe("wiz scry eval", () => {
	const fs = new NodeFs();
	let root: string;
	let proc: FakeProcess;
	let ps: NodePs;
	let log: MemoryLogger;
	let screen: Screen | undefined;
	let timer: FakeTimer;
	const answering = new FakeJudge(0.9);
	// each request ticks the timer, so a live screen draws while it is out
	const providers = {
		judge: async (): Promise<Judge> => ({
			judge: (judgment) => {
				timer.fireIntervals();
				return answering.judge(judgment);
			},
			count: async () => 0,
		}),
	};

	const printed = () =>
		color.strip(log.entries.map((entry) => String(entry.message)).join("\n"));
	/**
	 * Installs a rule whose `rule.ts` is `source`, with a good case of one
	 * class and a bad one of two, `Foo` and `Bar`.
	 */
	const install = async (id: string, source: string) => {
		await fs.mkdir(`${root}/.wiz/scry/${id}/evals`);
		await fs.write(`${root}/.wiz/scry/${id}/rule.ts`, source);
		await fs.write(
			`${root}/.wiz/scry/${id}/evals/foo.good.ts`,
			"class Foo {}\n",
		);
		await fs.write(
			`${root}/.wiz/scry/${id}/evals/foo.bad.ts`,
			"class Foo {}\nclass Bar {}\n",
		);
	};
	/** Flags each line holding `word`, decided by code. */
	const flagging = (word: string) =>
		ruleSource(`async check(file) {
			return file.lines.flatMap((line, index) =>
				line.includes("${word}") ? [{ line: index + 1, message: "no ${word}", confidence: 1 }] : [],
			);
		}`);

	/** Asks the decider about each case's first class. */
	const asking =
		ruleSource(`constructor(tools) { this.decider = tools.decider; }
		async check(file) {
			const [first] = file.ts.topLevelClasses();
			return [first.flag("no", await this.decider.decide("Is it?", first))];
		}`);

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "scry-eval-"));
		proc = new FakeProcess();
		proc.env = { PATH: process.env.PATH, HOME: root };
		ps = new NodePs({ proc });
		proc.chdir(root);
		log = new MemoryLogger();
		screen = undefined;
		timer = new FakeTimer();
		await ps.spawnCapture(["git", "-C", root, "init", "-q"]);
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const run = (ids: string[] = [], format = "text") =>
		evaluate({ ids, format, log, fs, ps, providers, screen, timer });

	it("scores each rule on its cases, and names the ones it got wrong", async () => {
		await install("no-bar", flagging("Bar"));
		await fs.write(`${root}/.wiz/scry/no-bar/evals/a.good.ts`, "Bar\n");
		await install("no-baz", flagging("Baz"));
		await fs.mkdir(`${root}/.wiz/scry/uncased`);
		await fs.write(`${root}/.wiz/scry/uncased/rule.ts`, ruleSource());

		await run();

		expect(printed()).toEqual(
			[
				"rule     right   missed   false alarms",
				"no-bar   2/3     -        1",
				"no-baz   1/2     1        -",
				"",
				"wrong",
				"  no-bar   evals/a.good.ts    line 1: no Bar (100%)",
				"  no-baz   evals/foo.bad.ts   missed: reported nothing",
				"",
				"✖ 3 of 5 cases right (60.0%) across 2 rules",
				"  1 rule with no cases in evals/: uncased",
			].join("\n"),
		);
	});

	it("says what asking the model cost", async () => {
		await install("asks", asking);

		await run(["asks"]);

		expect(printed()).toContain(
			"✖ 1 of 2 cases right (50.0%) across 1 rule\n  asked 2 questions in 2 requests",
		);
	});

	it("draws how many cases are scored on a live screen, and erases it before the scores", async () => {
		await install("asks", asking);
		const drawn: { text: string; printed: number }[] = [];
		screen = {
			live: true,
			columns: 200,
			write: (text) => {
				drawn.push({ text: color.strip(text), printed: log.entries.length });
			},
		};

		await run();

		expect(drawn).toEqual([
			{
				text: "\r⠋ scoring 0 of 2 cases · 2 questions asked, 0 answered\u001B[K",
				printed: 0,
			},
			{
				text: "\r⠙ scoring 0 of 2 cases · 2 questions asked, 0 answered\u001B[K",
				printed: 0,
			},
			{ text: "\r\u001B[K", printed: 0 },
		]);
		expect(printed()).toContain("1 of 2 cases right");
	});

	it("prints the scores as JSON when asked", async () => {
		await install("no-bar", flagging("Bar"));

		await run(["no-bar"], "json");

		expect(JSON.parse(printed())).toMatchObject({
			rules: [
				{
					rule: "no-bar",
					cases: [
						{ name: "evals/foo.bad.ts" },
						{ name: "evals/foo.good.ts", findings: [] },
					],
				},
			],
			spent: { questions: 0 },
		});
	});
});
