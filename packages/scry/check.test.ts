import { beforeEach, describe, expect, it } from "bun:test";
import { NodeGlob } from "webappwiz/system";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { Check } from "./check";
import type { Changeset } from "./git";
import type { Judge } from "./judge";
import { Rules } from "./rules";
import { FakeJudge, ruleDoc } from "./testing";

describe("Check", () => {
	let fs: FakeFs;
	let ps: FakePs;

	const changes: Changeset = {
		since: "main",
		files: [
			{ path: "src/a.ts", diff: "@@ -0,0 +1 @@\n+const a = 1;" },
			{ path: "src/b.ts", diff: "@@ -0,0 +1 @@\n+const b = 2;" },
			{ path: "notes.txt", diff: "@@ -0,0 +1 @@\n+notes" },
		],
	};

	const install = async (id: string, doc: string) => {
		await fs.mkdir(`/p/.wiz/scry/${id}`);
		await fs.write(`/p/.wiz/scry/${id}/RULE.md`, doc);
	};

	const prepare = async () =>
		Check.prepare({
			dir: "/p",
			rules: await Rules.load("/p", { fs }),
			changes,
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

	it("makes a call for each file and effort, asking about every rule of it", async () => {
		await install("fast-one", ruleDoc("fast-one", { effort: "low" }));
		await install("fast-two", ruleDoc("fast-two", { effort: "low" }));
		await install("deep", ruleDoc("deep", { effort: "high" }));
		await install("docs", ruleDoc("docs", { files: "**/*.txt" }));

		const check = await prepare();

		expect(check.calls.map((call) => [call.effort, call.file])).toEqual([
			["low", "src/a.ts"],
			["high", "src/a.ts"],
			["low", "src/b.ts"],
			["high", "src/b.ts"],
			["medium", "notes.txt"],
		]);
		expect(Object.keys(check.calls[0]?.judgment.questions ?? {})).toEqual([
			"q0",
			"q1",
		]);
		expect(check.efforts).toEqual(new Set(["low", "medium", "high"]));
	});

	it("leaves out the eval cases beside a rule, which break it on purpose", async () => {
		await install("no-foo", ruleDoc("no-foo"));
		await fs.mkdir("/p/.wiz/scry/no-foo/evals");
		await fs.write("/p/.wiz/scry/no-foo/evals/foo.bad.ts", "foo\n");
		await fs.mkdir("/p/src/evals");
		await fs.write("/p/src/evals/run.ts", "run\n");

		const check = await Check.prepare({
			dir: "/p",
			rules: await Rules.load("/p", { fs }),
			changes: {
				since: "main",
				files: [
					{
						path: ".wiz/scry/no-foo/evals/foo.bad.ts",
						diff: "@@ -0,0 +1 @@\n+foo",
					},
					{ path: "src/evals/run.ts", diff: "@@ -0,0 +1 @@\n+run" },
				],
			},
			fs,
			ps,
			glob: new NodeGlob(),
		});

		expect(check.calls.map((call) => call.file)).toEqual(["src/evals/run.ts"]);
	});

	it("totals the tokens of every call", async () => {
		await install("no-foo", ruleDoc("no-foo"));

		const check = await prepare();

		expect(check.tokens).toEqual(
			check.calls.reduce((sum, call) => sum + call.tokens, 0),
		);
	});

	it("reports what the judges found, in file and line order", async () => {
		await install("no-foo", ruleDoc("no-foo", { description: "No foo." }));

		const report = await (await prepare()).run({
			judges: new Map([["medium", new FakeJudge(0.9)]]),
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
					message: "No foo.",
					probability: 0.9,
				},
				{
					file: "src/b.ts",
					line: 1,
					level: "error",
					rule: "no-foo",
					message: "No foo.",
					probability: 0.9,
				},
			],
			unchecked: [],
			files: 2,
			rules: 1,
			cancelled: false,
			legacy: [],
		});
	});

	it("leaves out what its judge was not sure enough of", async () => {
		await install("no-foo", ruleDoc("no-foo"));

		const report = await (await prepare()).run({
			judges: new Map([["medium", new FakeJudge(0.4)]]),
			jobs: 1,
		});

		expect(report.findings).toEqual([]);
	});

	it("reports the file of a call as unchecked when its judge fails, rather than as clean", async () => {
		await install("no-foo", ruleDoc("no-foo"));

		const report = await (await prepare()).run({
			judges: new Map([["medium", new FakeJudge(new Error("judge down"))]]),
			jobs: 1,
		});

		expect(report.unchecked).toEqual([
			{ subject: "src/a.ts", reason: "judge down" },
			{ subject: "src/b.ts", reason: "judge down" },
		]);
	});

	it("refuses to run without a judge for every effort it needs", async () => {
		await install("deep", ruleDoc("deep", { effort: "high" }));

		await expect(
			(await prepare()).run({ judges: new Map(), jobs: 1 }),
		).rejects.toThrow("no judge for effort high");
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
		const report = await check.run({ judges: new Map(), jobs: 1 });

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
				probability: 1,
			},
		]);
	});

	it("asks the judge about a script's candidates for a rule that has an effort", async () => {
		await install("hinted", ruleDoc("hinted"));
		await fs.mkdir("/p/.wiz/scry/hinted/scripts");
		await fs.write("/p/.wiz/scry/hinted/scripts/check.sh", "#!/bin/sh\n");
		ps.setCaptureOutput("src/a.ts:1: worth a look\n", "");

		const check = await prepare();

		expect(check.calls[0]?.judgment.questions.q1?.instructions).toContain(
			'A script flagged line 1 of `file`: "worth a look".',
		);
	});

	it("reports a script that fails as unchecked", async () => {
		await install("scripted", ruleDoc("scripted", { effort: "none" }));
		await fs.mkdir("/p/.wiz/scry/scripted/scripts");
		await fs.write("/p/.wiz/scry/scripted/scripts/check.sh", "#!/bin/sh\n");
		ps.simulate(() => Promise.resolve(2));

		const report = await (await prepare()).run({ judges: new Map(), jobs: 1 });

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

		const report = await (await prepare()).run({ judges: new Map(), jobs: 1 });

		expect(report.findings).toEqual([]);
		expect(report.legacy).toEqual(["src/a.ts"]);
	});

	it("raises an event as each call goes out and comes back, counting them", async () => {
		await install("no-foo", ruleDoc("no-foo"));
		const check = await prepare();
		const answered: [number, string, string | undefined][] = [];
		const asked: string[] = [];
		check.events.on("asked", ({ call }) => {
			asked.push(call.file);
		});
		check.events.on("answered", ({ done, call, error }) => {
			answered.push([done, call.file, error]);
		});

		await check.run({
			judges: new Map([["medium", new FakeJudge(new Error("down"))]]),
			jobs: 1,
		});

		expect(answered).toEqual([
			[1, "src/a.ts", "down"],
			[2, "src/b.ts", "down"],
		]);
		expect(asked).toEqual(["src/a.ts", "src/b.ts"]);
	});

	it("stops when cancelled, keeping what came back and naming the rest as cancelled", async () => {
		await install("no-foo", ruleDoc("no-foo"));
		const check = await prepare();
		const cancel = new AbortController();
		const settled: [string, boolean | undefined][] = [];
		check.events.on("answered", ({ call, cancelled }) => {
			settled.push([call.file, cancelled]);
		});
		let calls = 0;
		const judge: Judge = {
			// the first call answers; the second hangs until the check is cancelled
			judge: (judgment) => {
				calls++;
				if (judgment.state.path === "src/a.ts") {
					return Promise.resolve({ answers: new Map([["q0", 1]]) });
				}
				cancel.abort();
				return new Promise(() => undefined);
			},
		};

		const report = await check.run({
			judges: new Map([["medium", judge]]),
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
			["src/a.ts", undefined],
			["src/b.ts", true],
		]);
		expect(calls).toEqual(2);
	});

	it("sends nothing once cancelled, and names every call as cancelled", async () => {
		await install("no-foo", ruleDoc("no-foo"));
		const check = await prepare();
		const cancel = new AbortController();
		cancel.abort();
		const judge = new FakeJudge(0);

		const report = await check.run({
			judges: new Map([["medium", judge]]),
			jobs: 2,
			signal: cancel.signal,
		});

		expect(judge.judgments).toEqual([]);
		expect(report.unchecked.map((item) => item.reason)).toEqual([
			"cancelled",
			"cancelled",
		]);
	});

	it("names a file once when its calls at several efforts fail the same way", async () => {
		await install("fast", ruleDoc("fast", { effort: "low" }));
		await install("deep", ruleDoc("deep", { effort: "high" }));
		const down = new FakeJudge(new Error("down"));

		const report = await (await prepare()).run({
			judges: new Map([
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

	it("sums what the judges say they spent", async () => {
		await install("no-foo", ruleDoc("no-foo"));

		const report = await (await prepare()).run({
			judges: new Map([["medium", new FakeJudge(0, { input: 100 })]]),
			jobs: 1,
		});

		expect(report.usage).toEqual({ calls: 2, input: 200 });
	});

	it("reports no usage when no judge says what it spent", async () => {
		await install("no-foo", ruleDoc("no-foo"));

		const report = await (await prepare()).run({
			judges: new Map([["medium", new FakeJudge(0)]]),
			jobs: 1,
		});

		expect(report.usage).toBeUndefined();
	});
});
