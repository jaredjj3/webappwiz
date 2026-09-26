import { beforeEach, describe, expect, it } from "bun:test";
import { NodeGlob } from "webappwiz/system";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { type Agent, Check } from "./check";
import type { Changeset } from "./git";
import { Rules } from "./rules";
import { FakeAgent, ruleDoc } from "./testing";

describe("Check", () => {
	let fs: FakeFs;
	let ps: FakePs;

	const changes: Changeset = {
		since: "main",
		files: [
			{ path: "src/a.ts", diff: "+a" },
			{ path: "src/b.ts", diff: "+b" },
			{ path: "notes.txt", diff: "+n" },
		],
	};

	const install = async (id: string, doc: string) => {
		await fs.mkdir(`/p/.wiz/scry/${id}`);
		await fs.write(`/p/.wiz/scry/${id}/RULE.md`, doc);
	};

	const prepare = async (batch?: number) =>
		Check.prepare({
			dir: "/p",
			rules: await Rules.load("/p", { fs }),
			changes,
			batch,
			fs,
			ps,
			glob: new NodeGlob(),
		});

	beforeEach(async () => {
		fs = new FakeFs();
		ps = new FakePs();
		await fs.mkdir("/p/src");
		await fs.write("/p/src/a.ts", "const a = 1;\n");
		await fs.write("/p/src/b.ts", "const b = 2;\n");
		await fs.write("/p/notes.txt", "notes\n");
	});

	it("batches the files that match the same rules of an effort into one call", async () => {
		await install("fast-one", ruleDoc("fast-one", { effort: "low" }));
		await install("fast-two", ruleDoc("fast-two", { effort: "low" }));
		await install("deep", ruleDoc("deep", { effort: "high" }));
		await install("docs", ruleDoc("docs", { files: "**/*.txt" }));

		const check = await prepare();

		expect(check.calls.map((call) => [call.effort, call.files])).toEqual([
			["low", ["src/a.ts", "src/b.ts"]],
			["high", ["src/a.ts", "src/b.ts"]],
			["medium", ["notes.txt"]],
		]);
		expect(check.calls[0]?.prompt).toContain('<rule id="fast-two"');
		expect(check.efforts).toEqual(new Set(["low", "medium", "high"]));
	});

	it("starts another call when the next file would take one past the batch cap", async () => {
		await install("no-foo", ruleDoc("no-foo"));

		const check = await prepare(1);

		expect(check.calls.map((call) => call.files)).toEqual([
			["src/a.ts"],
			["src/b.ts"],
		]);
	});

	it("totals the tokens of every call", async () => {
		await install("no-foo", ruleDoc("no-foo"));

		const check = await prepare(1);

		expect(check.tokens).toEqual(
			check.calls.reduce((sum, call) => sum + call.tokens, 0),
		);
	});

	it("reports what the agents found, in file and line order", async () => {
		await install("no-foo", ruleDoc("no-foo"));
		const agent = new FakeAgent(
			'[{"file": "src/b.ts", "rule": "no-foo", "line": 1, "message": "foo"}, {"file": "src/a.ts", "rule": "no-foo", "line": 1, "message": "foo"}]',
		);

		const report = await (await prepare()).run({
			agents: new Map([["medium", agent]]),
			jobs: 2,
		});

		expect(report).toEqual({
			since: "main",
			findings: [
				{
					file: "src/a.ts",
					line: 1,
					level: "error",
					rule: "no-foo",
					message: "foo",
				},
				{
					file: "src/b.ts",
					line: 1,
					level: "error",
					rule: "no-foo",
					message: "foo",
				},
			],
			unchecked: [],
			files: 2,
			rules: 1,
			cancelled: false,
			legacy: [],
		});
	});

	it("reports every file of a call as unchecked when its agent fails, rather than as clean", async () => {
		await install("no-foo", ruleDoc("no-foo"));

		const report = await (await prepare()).run({
			agents: new Map([["medium", new FakeAgent(new Error("agent exited 1"))]]),
			jobs: 1,
		});

		expect(report.unchecked).toEqual([
			{ subject: "src/a.ts", reason: "agent exited 1" },
			{ subject: "src/b.ts", reason: "agent exited 1" },
		]);
	});

	it("refuses to run without an agent for every effort it needs", async () => {
		await install("deep", ruleDoc("deep", { effort: "high" }));

		await expect(
			(await prepare()).run({ agents: new Map(), jobs: 1 }),
		).rejects.toThrow("no agent for effort high");
	});

	it("takes the findings of an effort: none rule straight from its script, honoring scry-ignore", async () => {
		await install("scripted", ruleDoc("scripted", { effort: "none" }));
		await fs.mkdir("/p/.wiz/scry/scripted/scripts");
		await fs.write("/p/.wiz/scry/scripted/scripts/check.sh", "#!/bin/sh\n");
		await fs.write(
			"/p/src/b.ts",
			"// scry-ignore scripted: on purpose\nconst b = 2;\n",
		);
		ps.setCaptureOutput(
			"src/a.ts:1: flagged\nsrc/b.ts:2: flagged\nelse.ts:1: no\n",
			"",
		);

		const check = await prepare();
		const report = await check.run({ agents: new Map(), jobs: 1 });

		expect(check.calls).toEqual([]);
		expect(ps.getCalls()).toEqual([
			"/bin/sh .wiz/scry/scripted/scripts/check.sh src/a.ts src/b.ts",
		]);
		expect(report.findings).toEqual([
			{
				file: "src/a.ts",
				line: 1,
				level: "error",
				rule: "scripted",
				message: "flagged",
			},
		]);
	});

	it("hands a script's candidates to the agent of a rule that has an effort", async () => {
		await install("hinted", ruleDoc("hinted"));
		await fs.mkdir("/p/.wiz/scry/hinted/scripts");
		await fs.write("/p/.wiz/scry/hinted/scripts/check.sh", "#!/bin/sh\n");
		ps.setCaptureOutput("src/a.ts:1: worth a look\n", "");

		const check = await prepare();

		expect(check.calls[0]?.prompt).toContain(
			"- hinted, src/a.ts line 1: worth a look",
		);
	});

	it("reports a script that fails as unchecked", async () => {
		await install("scripted", ruleDoc("scripted", { effort: "none" }));
		await fs.mkdir("/p/.wiz/scry/scripted/scripts");
		await fs.write("/p/.wiz/scry/scripted/scripts/check.sh", "#!/bin/sh\n");
		ps.simulate(() => Promise.resolve(2));

		const report = await (await prepare()).run({ agents: new Map(), jobs: 1 });

		expect(report.unchecked).toEqual([
			{
				subject: ".wiz/scry/scripted/scripts/check.sh",
				reason: ".wiz/scry/scripted/scripts/check.sh exited 2",
			},
		]);
	});

	it("names the files still using rule-ignore, and honors it like scry-ignore", async () => {
		await install("scripted", ruleDoc("scripted", { effort: "none" }));
		await fs.mkdir("/p/.wiz/scry/scripted/scripts");
		await fs.write("/p/.wiz/scry/scripted/scripts/check.sh", "#!/bin/sh\n");
		await fs.write(
			"/p/src/a.ts",
			"// rule-ignore scripted: from before scry\nconst a = 1;\n",
		);
		ps.setCaptureOutput("src/a.ts:2: flagged\n", "");

		const report = await (await prepare()).run({ agents: new Map(), jobs: 1 });

		expect(report.findings).toEqual([]);
		expect(report.legacy).toEqual(["src/a.ts"]);
	});

	it("raises an event as each call goes out and comes back, counting them", async () => {
		await install("no-foo", ruleDoc("no-foo"));
		const check = await prepare(1);
		const answered: [number, string[], string | undefined][] = [];
		const asked: string[][] = [];
		check.events.on("asked", ({ call }) => {
			asked.push([...call.files]);
		});
		check.events.on("answered", ({ done, call, error }) => {
			answered.push([done, [...call.files], error]);
		});

		await check.run({
			agents: new Map([["medium", new FakeAgent(new Error("down"))]]),
			jobs: 1,
		});

		expect(answered).toEqual([
			[1, ["src/a.ts"], "down"],
			[2, ["src/b.ts"], "down"],
		]);
		expect(asked).toEqual([["src/a.ts"], ["src/b.ts"]]);
	});

	it("stops when cancelled, keeping what came back and naming the rest as cancelled", async () => {
		await install("no-foo", ruleDoc("no-foo"));
		const check = await prepare(1);
		const cancel = new AbortController();
		const settled: [string[], boolean | undefined][] = [];
		check.events.on("answered", ({ call, cancelled }) => {
			settled.push([[...call.files], cancelled]);
		});
		let calls = 0;
		const agent = {
			// the first call answers; the second hangs until the check is cancelled
			ask: (prompt: string) => {
				calls++;
				if (prompt.includes("src/a.ts")) {
					return Promise.resolve(
						'[{"file": "src/a.ts", "rule": "no-foo", "line": 1, "message": "foo"}]',
					);
				}
				cancel.abort();
				return new Promise<string>(() => undefined);
			},
		};

		const report = await check.run({
			agents: new Map([["medium", agent]]),
			jobs: 1,
			signal: cancel.signal,
		});

		expect(report.cancelled).toBe(true);
		expect(report.findings.map((finding) => finding.file)).toEqual([
			"src/a.ts",
		]);
		expect(report.unchecked).toEqual([
			{ subject: "src/b.ts", reason: "cancelled" },
		]);
		expect(settled).toEqual([
			[["src/a.ts"], undefined],
			[["src/b.ts"], true],
		]);
		expect(calls).toEqual(2);
	});

	it("sends nothing once cancelled, and names every call as cancelled", async () => {
		await install("no-foo", ruleDoc("no-foo"));
		const check = await prepare(1);
		const cancel = new AbortController();
		cancel.abort();
		const agent = new FakeAgent("[]");

		const report = await check.run({
			agents: new Map([["medium", agent]]),
			jobs: 2,
			signal: cancel.signal,
		});

		expect(agent.prompts).toEqual([]);
		expect(report.unchecked.map((item) => item.reason)).toEqual([
			"cancelled",
			"cancelled",
		]);
	});

	it("names a file once when its calls at several efforts fail the same way", async () => {
		await install("fast", ruleDoc("fast", { effort: "low" }));
		await install("deep", ruleDoc("deep", { effort: "high" }));
		const down = new FakeAgent(new Error("down"));

		const report = await (await prepare()).run({
			agents: new Map([
				["low", down],
				["high", down],
			]),
			jobs: 1,
		});

		expect(report.unchecked).toEqual([
			{ subject: "src/a.ts", reason: "down" },
			{ subject: "src/b.ts", reason: "down" },
		]);
	});

	it("relays what an agent says it is doing, and sums what it spent", async () => {
		await install("no-foo", ruleDoc("no-foo"));
		const check = await prepare(1);
		const statuses: [string, string][] = [];
		check.events.on("status", ({ call, status }) => {
			statuses.push([call.files[0] ?? "", status]);
		});
		const agent: Agent = {
			ask: async (_prompt, opts) => {
				opts?.observer?.status("thinking");
				opts?.observer?.usage({
					input: 100,
					cached: 60,
					output: 10,
					cost: 0.5,
				});
				return "[]";
			},
		};

		const report = await check.run({
			agents: new Map([["medium", agent]]),
			jobs: 1,
		});

		expect(statuses).toEqual([
			["src/a.ts", "thinking"],
			["src/b.ts", "thinking"],
		]);
		expect(report.usage).toEqual({
			calls: 2,
			input: 200,
			cached: 120,
			output: 20,
			cost: 1,
		});
	});

	it("reports no usage when no agent says what it spent", async () => {
		await install("no-foo", ruleDoc("no-foo"));

		const report = await (await prepare()).run({
			agents: new Map([["medium", new FakeAgent("[]")]]),
			jobs: 1,
		});

		expect(report.usage).toBeUndefined();
	});
});
